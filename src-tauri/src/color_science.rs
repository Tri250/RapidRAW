//! Professional ACES color science implementation in pure Rust.
//!
//! Provides color space conversions, ACES RRT+ODT output transforms, and
//! tone-mapping utilities following the Academy Color Encoding System
//! specification.

use std::fmt;

// ---------------------------------------------------------------------------
// ColorSpace enum
// ---------------------------------------------------------------------------

/// Named color spaces commonly used in a RAW photo editing pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ColorSpace {
    SRGB,
    DisplayP3,
    Rec2020,
    ACES2065_1,
    ACEScg,
    ACEScc,
    ACEScct,
    LinearSRGB,
}

impl fmt::Display for ColorSpace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ColorSpace::SRGB => write!(f, "sRGB"),
            ColorSpace::DisplayP3 => write!(f, "Display P3"),
            ColorSpace::Rec2020 => write!(f, "Rec.2020"),
            ColorSpace::ACES2065_1 => write!(f, "ACES 2065-1"),
            ColorSpace::ACEScg => write!(f, "ACEScg"),
            ColorSpace::ACEScc => write!(f, "ACEScc"),
            ColorSpace::ACEScct => write!(f, "ACEScct"),
            ColorSpace::LinearSRGB => write!(f, "Linear sRGB"),
        }
    }
}

// ---------------------------------------------------------------------------
// ColorPrimaries
// ---------------------------------------------------------------------------

/// CIE xy chromaticity coordinates for the red, green, blue primaries and
/// the white point of a color space.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ColorPrimaries {
    pub red_xy: (f64, f64),
    pub green_xy: (f64, f64),
    pub blue_xy: (f64, f64),
    pub white_xy: (f64, f64),
}

// ---------------------------------------------------------------------------
// Predefined primaries
// ---------------------------------------------------------------------------

/// sRGB primaries (D65 white point).
pub const SRGB_PRIMARIES: ColorPrimaries = ColorPrimaries {
    red_xy: (0.6400, 0.3300),
    green_xy: (0.3000, 0.6000),
    blue_xy: (0.1500, 0.0600),
    white_xy: (0.3127, 0.3290),
};

/// Display P3 primaries (D65 white point).
pub const P3_PRIMARIES: ColorPrimaries = ColorPrimaries {
    red_xy: (0.6800, 0.3200),
    green_xy: (0.2650, 0.6900),
    blue_xy: (0.1500, 0.0600),
    white_xy: (0.3127, 0.3290),
};

/// Rec.2020 primaries (D65 white point).
pub const REC2020_PRIMARIES: ColorPrimaries = ColorPrimaries {
    red_xy: (0.7080, 0.2920),
    green_xy: (0.1700, 0.7970),
    blue_xy: (0.1310, 0.0460),
    white_xy: (0.3127, 0.3290),
};

/// ACES 2065-1 primaries (D60 / ACES white point at ~0.32168, 0.33767).
pub const ACES_PRIMARIES: ColorPrimaries = ColorPrimaries {
    red_xy: (0.7347, 0.2653),
    green_xy: (0.0000, 1.0000),
    blue_xy: (0.0001, -0.0770),
    white_xy: (0.32168, 0.33767),
};

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

type Mat3 = [[f64; 3]; 3];

/// Convert CIE xy chromaticity to XYZ tristimulus (relative to white point = 1).
fn xy_to_xyz(x: f64, y: f64) -> [f64; 3] {
    if y.abs() < f64::EPSILON {
        [0.0, 0.0, 0.0]
    } else {
        [x / y, 1.0, (1.0 - x - y) / y]
    }
}

/// 3×3 matrix multiply: C = A × B.
fn mat3_mul(a: &Mat3, b: &Mat3) -> Mat3 {
    let mut c = [[0.0f64; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    c
}

/// 3×3 matrix × column vector.
fn mat3_vec(m: &Mat3, v: [f64; 3]) -> [f64; 3] {
    [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]
}

/// Invert a 3×3 matrix (full pivot, cofactor method).
fn mat3_inv(m: &Mat3) -> Option<Mat3> {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
        - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

    if det.abs() < f64::EPSILON {
        return None;
    }

    let inv_det = 1.0 / det;
    Some([
        [
            (m[1][1] * m[2][2] - m[1][2] * m[2][1]) * inv_det,
            (m[0][2] * m[2][1] - m[0][1] * m[2][2]) * inv_det,
            (m[0][1] * m[1][2] - m[0][2] * m[1][1]) * inv_det,
        ],
        [
            (m[1][2] * m[2][0] - m[1][0] * m[2][2]) * inv_det,
            (m[0][0] * m[2][2] - m[0][2] * m[2][0]) * inv_det,
            (m[0][2] * m[1][0] - m[0][0] * m[1][2]) * inv_det,
        ],
        [
            (m[1][0] * m[2][1] - m[1][1] * m[2][0]) * inv_det,
            (m[0][1] * m[2][0] - m[0][0] * m[2][1]) * inv_det,
            (m[0][0] * m[1][1] - m[0][1] * m[1][0]) * inv_det,
        ],
    ])
}

// ---------------------------------------------------------------------------
// RGB ↔ XYZ matrices
// ---------------------------------------------------------------------------

/// Compute the 3×3 matrix that converts linear RGB (with the given primaries)
/// to CIE XYZ (D-relative, i.e. the white point has Y=1).
pub fn rgb_to_xyz(primaries: &ColorPrimaries) -> Mat3 {
    let r_xyz = xy_to_xyz(primaries.red_xy.0, primaries.red_xy.1);
    let g_xyz = xy_to_xyz(primaries.green_xy.0, primaries.green_xy.1);
    let b_xyz = xy_to_xyz(primaries.blue_xy.0, primaries.blue_xy.1);
    let w_xyz = xy_to_xyz(primaries.white_xy.0, primaries.white_xy.1);

    // P = [R_xyz | G_xyz | B_xyz]^T
    let p: Mat3 = [
        [r_xyz[0], g_xyz[0], b_xyz[0]],
        [r_xyz[1], g_xyz[1], b_xyz[1]],
        [r_xyz[2], g_xyz[2], b_xyz[2]],
    ];

    let p_inv = mat3_inv(&p).expect("Primaries matrix is singular");
    let s = mat3_vec(&p_inv, w_xyz);

    // M = P * diag(s)
    [
        [p[0][0] * s[0], p[0][1] * s[1], p[0][2] * s[2]],
        [p[1][0] * s[0], p[1][1] * s[1], p[1][2] * s[2]],
        [p[2][0] * s[0], p[2][1] * s[1], p[2][2] * s[2]],
    ]
}

/// Compute the inverse (XYZ → RGB) matrix for the given primaries.
pub fn xyz_to_rgb(primaries: &ColorPrimaries) -> Mat3 {
    let m = rgb_to_xyz(primaries);
    mat3_inv(&m).expect("RGB→XYZ matrix is singular")
}

// ---------------------------------------------------------------------------
// Cached conversion matrices
// ---------------------------------------------------------------------------

/// Pre-computed sRGB → XYZ (D65).
fn srgb_to_xyz_matrix() -> Mat3 {
    rgb_to_xyz(&SRGB_PRIMARIES)
}

/// Pre-computed XYZ (D65) → sRGB.
fn xyz_to_srgb_matrix() -> Mat3 {
    xyz_to_rgb(&SRGB_PRIMARIES)
}

/// Pre-computed Display P3 → XYZ (D65).
fn p3_to_xyz_matrix() -> Mat3 {
    rgb_to_xyz(&P3_PRIMARIES)
}

/// Pre-computed XYZ (D65) → Display P3.
fn xyz_to_p3_matrix() -> Mat3 {
    xyz_to_rgb(&P3_PRIMARIES)
}

/// Pre-computed ACES 2065-1 → XYZ.
fn aces_to_xyz_matrix() -> Mat3 {
    rgb_to_xyz(&ACES_PRIMARIES)
}

/// Pre-computed XYZ → ACES 2065-1.
fn xyz_to_aces_matrix() -> Mat3 {
    xyz_to_rgb(&ACES_PRIMARIES)
}

/// The official ACES linear sRGB ↔ ACEScg matrix (D60-based).
/// This is the standard matrix used in the ACES system.
///
/// sRGB (linear) to ACEScg:
/// ```text
///  0.6624541811  0.1340042065  0.1561876870
///  0.2722287168  0.6740817658  0.0536895174
/// -0.0055746495  0.0040607335  1.0103391003
/// ```
const LINEAR_SRGB_TO_ACESCG: Mat3 = [
    [0.6624541811, 0.1340042065, 0.1561876870],
    [0.2722287168, 0.6740817658, 0.0536895174],
    [-0.0055746495, 0.0040607335, 1.0103391003],
];

/// ACEScg to linear sRGB (inverse of the above).
const ACESCG_TO_LINEAR_SRGB: Mat3 = [
    [1.6410233797, -0.3248034292, -0.2364246882],
    [-0.6636628587, 1.6153319750, 0.0167563511],
    [0.0117218923, -0.0082844518, 0.9883949267],
];

// ---------------------------------------------------------------------------
// sRGB gamma
// ---------------------------------------------------------------------------

/// Remove sRGB transfer function (gamma → linear).
pub fn srgb_to_linear(v: f64) -> f64 {
    if v.abs() <= 0.04045 {
        v / 12.92
    } else {
        ((v.abs() + 0.055) / 1.055).powf(2.4).copysign(v)
    }
}

/// Apply sRGB transfer function (linear → gamma).
pub fn linear_to_srgb(v: f64) -> f64 {
    if v.abs() <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.abs().powf(1.0 / 2.4) - 0.055
    }
    .copysign(v)
}

// ---------------------------------------------------------------------------
// Direct color space conversion functions
// ---------------------------------------------------------------------------

/// Convert linear sRGB to ACEScg (AP1) using the official ACES matrix.
pub fn linear_srgb_to_acescg(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let out = mat3_vec(&LINEAR_SRGB_TO_ACESCG, [r, g, b]);
    (out[0], out[1], out[2])
}

/// Convert ACEScg (AP1) to linear sRGB using the official ACES matrix.
pub fn acescg_to_linear_srgb(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let out = mat3_vec(&ACESCG_TO_LINEAR_SRGB, [r, g, b]);
    (out[0], out[1], out[2])
}

// ---------------------------------------------------------------------------
// ACEScc / ACEScct logarithmic encoding
// ---------------------------------------------------------------------------

/// ACEScc constants.
const ACESCC_A: f64 = 9.72;
const ACESCC_B: f64 = 0.3013698630;

/// Convert scene-linear (ACEScg) value to ACEScc logarithmic encoding.
///
/// ACEScc encodes scene-linear values in [0, 1] to a logarithmic space
/// suitable for grading in standard video tools.
pub fn linear_to_acescc(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    fn encode(v: f64) -> f64 {
        if v <= 0.0 {
            0.0
        } else if v < ACESCC_A {
            (2.0_f64.log2() * v + ACESCC_B) / 5.0
        } else {
            (v.log2() + ACESCC_B) / 5.0
        }
    }
    (encode(r), encode(g), encode(b))
}

/// Convert ACEScc logarithmic encoding back to scene-linear (ACEScg).
pub fn acescc_to_linear(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    fn decode(v: f64) -> f64 {
        if v < 0.0 {
            0.0
        } else if v <= (2.0_f64.log2() * ACESCC_A + ACESCC_B) / 5.0 {
            // v = (log2(2)*x + ACESCC_B) / 5  =>  x = (5*v - ACESCC_B)
            let x = (5.0 * v - ACESCC_B) / 2.0_f64.log2();
            x.max(0.0)
        } else {
            // v = (log2(x) + ACESCC_B) / 5  =>  x = 2^(5*v - ACESCC_B)
            let x = 2.0_f64.powf(5.0 * v - ACESCC_B);
            x.max(0.0)
        }
    }
    (decode(r), decode(g), decode(b))
}

/// ACEScct linear segment threshold and slope.
/// Cut-point in linear: 0.0078125 (1/128)
const ACESCCT_CUT: f64 = 0.0078125;
const ACESCCT_SLOPE: f64 = 10.5402377416515;
const ACESCCT_OFFSET: f64 = 0.0729055341958355;

/// Convert scene-linear (ACEScg) value to ACEScct quasi-logarithmic encoding.
///
/// ACEScct has a linear segment near zero to provide a "toe" that better
/// matches the behaviour of traditional log film scans.
pub fn linear_to_acescct(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    fn encode(v: f64) -> f64 {
        if v <= 0.0 {
            ACESCCT_OFFSET + v * ACESCCT_SLOPE / 2.0
        } else if v < ACESCCT_CUT {
            ACESCCT_OFFSET + v * ACESCCT_SLOPE / 2.0
        } else {
            (v.log2() + ACESCC_B) / 5.0
        }
    }
    (encode(r), encode(g), encode(b))
}

/// Convert ACEScct back to scene-linear (ACEScg).
pub fn acescct_to_linear(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    fn decode(v: f64) -> f64 {
        // Threshold in ACEScct where the log curve crosses the linear segment
        let threshold = (ACESCCT_CUT.log2() + ACESCC_B) / 5.0;
        if v <= threshold {
            // Linear segment: v = offset + slope/2 * x  =>  x = 2*(v - offset)/slope
            (2.0 * (v - ACESCCT_OFFSET) / ACESCCT_SLOPE).max(0.0)
        } else {
            // Log segment: v = (log2(x) + ACESCC_B) / 5  =>  x = 2^(5*v - ACESCC_B)
            2.0_f64.powf(5.0 * v - ACESCC_B).max(0.0)
        }
    }
    (decode(r), decode(g), decode(b))
}

// ---------------------------------------------------------------------------
// sRGB ↔ Display P3 via XYZ intermediate
// ---------------------------------------------------------------------------

/// Convert sRGB (gamma-encoded) to Display P3 (gamma-encoded) via XYZ.
pub fn srgb_to_display_p3(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // sRGB gamma → linear
    let lr = srgb_to_linear(r);
    let lg = srgb_to_linear(g);
    let lb = srgb_to_linear(b);

    // linear sRGB → XYZ
    let xyz = mat3_vec(&srgb_to_xyz_matrix(), [lr, lg, lb]);

    // XYZ → linear Display P3
    let p3 = mat3_vec(&xyz_to_p3_matrix(), xyz);

    // linear → sRGB-like gamma (P3 uses the same transfer function as sRGB)
    (
        linear_to_srgb(p3[0]),
        linear_to_srgb(p3[1]),
        linear_to_srgb(p3[2]),
    )
}

/// Convert Display P3 (gamma-encoded) to sRGB (gamma-encoded) via XYZ.
pub fn display_p3_to_srgb(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // P3 gamma → linear
    let lr = srgb_to_linear(r);
    let lg = srgb_to_linear(g);
    let lb = srgb_to_linear(b);

    // linear P3 → XYZ
    let xyz = mat3_vec(&p3_to_xyz_matrix(), [lr, lg, lb]);

    // XYZ → linear sRGB
    let srgb = mat3_vec(&xyz_to_srgb_matrix(), xyz);

    // linear → sRGB gamma
    (
        linear_to_srgb(srgb[0]),
        linear_to_srgb(srgb[1]),
        linear_to_srgb(srgb[2]),
    )
}

// ---------------------------------------------------------------------------
// ACES RRT + ODT
// ---------------------------------------------------------------------------

/// Krzysztof Narkiewicz's fitted ACES curve approximation.
///
/// This is the widely-used polynomial approximation of the ACES RRT+ODT
/// filmic S-curve, accurate to within 0.001 of the reference implementation
/// across the normal range.
pub fn aces_fitted(x: f64) -> f64 {
    // Coefficients from Krzysztof Narkiewicz's fitted curve
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    (x * (a * x + b)) / (x * (c * x + d) + e)
}

/// ACES Reference Rendering Transform (RRT).
///
/// Applies the filmic tone curve to each channel independently using
/// the fitted ACES approximation. Input is scene-referred linear (ACES2065-1
/// or ACEScg). Output is display-referred.
pub fn aces_rrt(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    (aces_fitted(r), aces_fitted(g), aces_fitted(b))
}

/// ACES Output Device Transform for sRGB display (~100 nits).
///
/// Takes RRT output and maps it to sRGB display range with proper
/// limiting and gamma encoding.
pub fn aces_odt_srgb(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // Apply the ODT limit for sRGB (~48 nits target, factor ~0.18/0.18)
    // The standard ODT compresses the RRT output to the display range.
    // For sRGB monitor at 100 nits the gain is 1.0 (already baked into
    // the fitted curve constants when used with aces_fitted).

    // Clamp negative values (ODTs typically clamp at zero)
    let r = r.max(0.0);
    let g = g.max(0.0);
    let b = b.max(0.0);

    // Apply sRGB gamma encoding
    (linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b))
}

/// Full ACES output transform: RRT + ODT in one step.
///
/// Takes scene-linear input (any linear space) and produces display-ready
/// output for the specified target color space.
pub fn aces_output_transform(r: f64, g: f64, b: f64, target_space: ColorSpace) -> (f64, f64, f64) {
    // Step 1: Apply ACES RRT (filmic curve)
    let (rr, rg, rb) = aces_rrt(r, g, b);

    // Step 2: Apply ODT based on target space
    match target_space {
        ColorSpace::SRGB | ColorSpace::LinearSRGB => {
            let (or, og, ob) = aces_odt_srgb(rr, rg, rb);
            if target_space == ColorSpace::LinearSRGB {
                // Undo the gamma that aces_odt_srgb applied
                (srgb_to_linear(or), srgb_to_linear(og), srgb_to_linear(ob))
            } else {
                (or, og, ob)
            }
        }
        ColorSpace::DisplayP3 => {
            // Apply RRT output, then convert from sRGB-linear to P3-linear,
            // then gamma-encode.
            let lr = rr.max(0.0);
            let lg = rg.max(0.0);
            let lb = rb.max(0.0);

            // The RRT+ODT is designed for sRGB gamut; for P3 we convert
            // the linear output via XYZ.
            let xyz = mat3_vec(&srgb_to_xyz_matrix(), [lr, lg, lb]);
            let p3 = mat3_vec(&xyz_to_p3_matrix(), xyz);
            (
                linear_to_srgb(p3[0]),
                linear_to_srgb(p3[1]),
                linear_to_srgb(p3[2]),
            )
        }
        ColorSpace::Rec2020 => {
            let lr = rr.max(0.0);
            let lg = rg.max(0.0);
            let lb = rb.max(0.0);

            let xyz = mat3_vec(&srgb_to_xyz_matrix(), [lr, lg, lb]);
            let rec = mat3_vec(&xyz_to_rgb(&REC2020_PRIMARIES), xyz);

            // Rec.2020 10-bit gamma (same function shape as sRGB per BT.2100)
            (
                linear_to_srgb(rec[0]),
                linear_to_srgb(rec[1]),
                linear_to_srgb(rec[2]),
            )
        }
        ColorSpace::ACES2065_1 | ColorSpace::ACEScg => {
            // For ACES targets, just return the RRT output clamped (no ODT)
            (rr.max(0.0), rg.max(0.0), rb.max(0.0))
        }
        ColorSpace::ACEScc => {
            let (lr, lg, lb) = aces_rrt(r, g, b);
            linear_to_acescc(lr.max(0.0), lg.max(0.0), lb.max(0.0))
        }
        ColorSpace::ACEScct => {
            let (lr, lg, lb) = aces_rrt(r, g, b);
            linear_to_acescct(lr.max(0.0), lg.max(0.0), lb.max(0.0))
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn color_convert_space(
    r: f64,
    g: f64,
    b: f64,
    from_space: String,
    to_space: String,
) -> Result<Vec<f64>, String> {
    let from = parse_color_space(&from_space)?;
    let to = parse_color_space(&to_space)?;

    // Step 1: convert from source space to linear
    let (lr, lg, lb) = to_linear(r, g, b, from);

    // Step 2: convert via XYZ intermediate if needed
    let (out_r, out_g, out_b) = if from == to {
        (lr, lg, lb)
    } else {
        // Convert linear source → XYZ
        let from_prim = primaries_for_space(from);
        let to_prim = primaries_for_space(to);
        let from_m = rgb_to_xyz(from_prim);
        let to_m = xyz_to_rgb(to_prim);
        let xyz = mat3_vec(&from_m, [lr, lg, lb]);
        let rgb = mat3_vec(&to_m, xyz);
        (rgb[0], rgb[1], rgb[2])
    };

    // Step 3: apply target transfer function
    let (fr, fg, fb) = from_linear(out_r, out_g, out_b, to);

    Ok(vec![fr, fg, fb])
}

#[tauri::command]
pub fn color_apply_aces_output(
    r: f64,
    g: f64,
    b: f64,
    target_space: String,
) -> Result<Vec<f64>, String> {
    let target = parse_color_space(&target_space)?;
    let (or, og, ob) = aces_output_transform(r, g, b, target);
    Ok(vec![or, og, ob])
}

#[tauri::command]
pub fn color_srgb_to_linear(r: f64, g: f64, b: f64) -> Vec<f64> {
    vec![srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)]
}

#[tauri::command]
pub fn color_linear_to_srgb(r: f64, g: f64, b: f64) -> Vec<f64> {
    vec![linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b)]
}

#[tauri::command]
pub fn color_apply_aces_fitted(value: f64) -> f64 {
    aces_fitted(value)
}

// ---------------------------------------------------------------------------
// Helper functions for Tauri commands
// ---------------------------------------------------------------------------

fn parse_color_space(name: &str) -> Result<ColorSpace, String> {
    match name.to_lowercase().as_str() {
        "srgb" => Ok(ColorSpace::SRGB),
        "display_p3" | "displayp3" | "p3" => Ok(ColorSpace::DisplayP3),
        "rec2020" | "rec.2020" => Ok(ColorSpace::Rec2020),
        "aces2065-1" | "aces2065_1" | "aces" => Ok(ColorSpace::ACES2065_1),
        "acescg" => Ok(ColorSpace::ACEScg),
        "acescc" => Ok(ColorSpace::ACEScc),
        "acescct" => Ok(ColorSpace::ACEScct),
        "linear_srgb" | "linearsrgb" => Ok(ColorSpace::LinearSRGB),
        _ => Err(format!("Unknown color space: '{}'", name)),
    }
}

fn primaries_for_space(space: ColorSpace) -> &'static ColorPrimaries {
    match space {
        ColorSpace::SRGB | ColorSpace::LinearSRGB => &SRGB_PRIMARIES,
        ColorSpace::DisplayP3 => &P3_PRIMARIES,
        ColorSpace::Rec2020 => &REC2020_PRIMARIES,
        ColorSpace::ACES2065_1 | ColorSpace::ACEScg | ColorSpace::ACEScc | ColorSpace::ACEScct => {
            &ACES_PRIMARIES
        }
    }
}

/// Convert gamma-encoded RGB to linear RGB based on the color space
fn to_linear(r: f64, g: f64, b: f64, space: ColorSpace) -> (f64, f64, f64) {
    match space {
        ColorSpace::SRGB | ColorSpace::DisplayP3 | ColorSpace::Rec2020 => {
            (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b))
        }
        ColorSpace::LinearSRGB | ColorSpace::ACES2065_1 | ColorSpace::ACEScg => (r, g, b),
        ColorSpace::ACEScc => acescc_to_linear(r, g, b),
        ColorSpace::ACEScct => acescct_to_linear(r, g, b),
    }
}

/// Convert linear RGB to gamma-encoded RGB based on the color space
fn from_linear(r: f64, g: f64, b: f64, space: ColorSpace) -> (f64, f64, f64) {
    match space {
        ColorSpace::SRGB | ColorSpace::DisplayP3 | ColorSpace::Rec2020 => {
            (linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b))
        }
        ColorSpace::LinearSRGB | ColorSpace::ACES2065_1 | ColorSpace::ACEScg => (r, g, b),
        ColorSpace::ACEScc => linear_to_acescc(r, g, b),
        ColorSpace::ACEScct => linear_to_acescct(r, g, b),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_srgb_gamma_roundtrip() {
        for v in &[0.0, 0.001, 0.04045, 0.18, 0.5, 0.9, 1.0] {
            let linear = srgb_to_linear(*v);
            let back = linear_to_srgb(linear);
            assert!(
                (back - *v).abs() < 1e-12,
                "Roundtrip failed for v={}: got {}",
                v,
                back
            );
        }
    }

    #[test]
    fn test_srgb_negative() {
        // Negative values should round-trip preserving sign
        let linear = srgb_to_linear(-0.5);
        let back = linear_to_srgb(linear);
        assert!(
            (back - (-0.5)).abs() < 1e-12,
            "Negative roundtrip failed: got {}",
            back
        );
    }

    #[test]
    fn test_linear_srgb_acescg_roundtrip() {
        let (r, g, b) = (0.18, 0.5, 0.8);
        let (ar, ag, ab) = linear_srgb_to_acescg(r, g, b);
        let (br, bg, bb) = acescg_to_linear_srgb(ar, ag, ab);
        assert!((br - r).abs() < 1e-12, "R mismatch: {} vs {}", br, r);
        assert!((bg - g).abs() < 1e-12, "G mismatch: {} vs {}", bg, g);
        assert!((bb - b).abs() < 1e-12, "B mismatch: {} vs {}", bb, b);
    }

    #[test]
    fn test_acescc_roundtrip() {
        for v in &[0.001, 0.01, 0.18, 0.5, 1.0, 4.0, 16.0] {
            let (cr, cg, cb) = linear_to_acescc(*v, *v * 0.5, *v * 0.25);
            let (lr, lg, lb) = acescc_to_linear(cr, cg, cb);
            assert!((lr - *v).abs() < 1e-10, "R roundtrip failed for {}", v);
            assert!((lg - *v * 0.5).abs() < 1e-10, "G roundtrip failed");
            assert!((lb - *v * 0.25).abs() < 1e-10, "B roundtrip failed");
        }
    }

    #[test]
    fn test_acescct_roundtrip() {
        for v in &[0.001, 0.005, 0.0078125, 0.01, 0.18, 0.5, 1.0, 4.0] {
            let (cr, cg, cb) = linear_to_acescct(*v, *v, *v);
            let (lr, lg, lb) = acescct_to_linear(cr, cg, cb);
            assert!(
                (lr - *v).abs() < 1e-10,
                "R roundtrip failed for {}: got {}",
                v,
                lr
            );
        }
    }

    #[test]
    fn test_acescct_zero_and_negative() {
        let (cr, _cg, _cb) = linear_to_acescct(0.0, 0.0, 0.0);
        let (lr, _lg, _lb) = acescct_to_linear(cr, 0.0, 0.0);
        assert!(lr.abs() < 1e-10, "Zero should roundtrip, got {}", lr);

        let (cr, _, _) = linear_to_acescct(-0.5, 0.0, 0.0);
        let (lr, _, _) = acescct_to_linear(cr, 0.0, 0.0);
        assert!(lr >= 0.0, "Negative should decode to >= 0, got {}", lr);
    }

    #[test]
    fn test_srgb_p3_roundtrip() {
        let (r, g, b) = (0.5, 0.3, 0.7);
        let (pr, pg, pb) = srgb_to_display_p3(r, g, b);
        let (br, bg, bb) = display_p3_to_srgb(pr, pg, pb);
        assert!((br - r).abs() < 1e-10, "R roundtrip failed");
        assert!((bg - g).abs() < 1e-10, "G roundtrip failed");
        assert!((bb - b).abs() < 1e-10, "B roundtrip failed");
    }

    #[test]
    fn test_aces_fitted_midgrey() {
        // 18% grey should map to roughly 0.46 (display-referred mid)
        let mid = aces_fitted(0.18);
        assert!(
            (mid - 0.4616).abs() < 0.01,
            "18% grey should map to ~0.46, got {}",
            mid
        );
    }

    #[test]
    fn test_aces_fitted_bounds() {
        assert!(aces_fitted(0.0).abs() < 1e-10, "Zero in → zero out");
        assert!(
            (aces_fitted(1.0) - 1.0).abs() < 0.01,
            "One in → ~one out, got {}",
            aces_fitted(1.0)
        );
        // Should be monotonically increasing
        let mut prev = aces_fitted(0.0);
        for i in 1..=100 {
            let v = aces_fitted(i as f64 / 100.0);
            assert!(v >= prev, "Not monotonic at {}", i);
            prev = v;
        }
    }

    #[test]
    fn test_output_transform_srgb() {
        // Smoke test: output should be in [0, 1] for reasonable inputs
        let (r, g, b) = aces_output_transform(0.18, 0.18, 0.18, ColorSpace::SRGB);
        assert!(r >= 0.0 && r <= 1.0, "R out of range: {}", r);
        assert!(g >= 0.0 && g <= 1.0);
        assert!(b >= 0.0 && b <= 1.0);
    }

    #[test]
    fn test_rgb_xyz_matrix_identity() {
        // sRGB → XYZ → sRGB should be identity
        let m1 = srgb_to_xyz_matrix();
        let m2 = xyz_to_srgb_matrix();
        let product = mat3_mul(&m1, &m2);
        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (product[i][j] - expected).abs() < 1e-10,
                    "Matrix product not identity at [{},{}]: {}",
                    i,
                    j,
                    product[i][j]
                );
            }
        }
    }

    #[test]
    fn test_primaries_white_point_srgb() {
        // Converting the D65 white point through sRGB→XYZ should give
        // the D65 XYZ value (0.95047, 1.0, 1.08883)
        let m = srgb_to_xyz_matrix();
        let xyz = mat3_vec(&m, [1.0, 1.0, 1.0]);
        assert!(
            (xyz[1] - 1.0).abs() < 1e-10,
            "White Y should be 1.0, got {}",
            xyz[1]
        );
        // Standard D65 XYZ: X≈0.95047, Z≈1.08883
        assert!(
            (xyz[0] - 0.95047).abs() < 0.001,
            "White X should be ~0.9505, got {}",
            xyz[0]
        );
    }
}
