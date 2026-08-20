/// Detect whether a Canon CR2 file was shot with in-camera multiple exposure.
///
/// Canon stores the multiple-exposure flag in MakerNote tag 0x4021.
/// This function walks the TIFF IFD chain to locate the tag without a full
/// metadata parser, keeping the dependency surface minimal.
///
/// # Arguments
/// * `file_bytes` - Raw bytes of the CR2 file (must be at least 8 bytes).
///
/// # Returns
/// `true` if the file is an in-camera multiple exposure, `false` otherwise.
pub fn is_incamera_multiexposure_canon(file_bytes: &[u8]) -> bool {
    // Defensive: this function is invoked from generic image-load paths that
    // may pass tiny or non-TIFF buffers (e.g. small JPEGs). Bail out instead
    // of asserting — a multi-exposure CR2 is always far larger than 8 bytes.
    if file_bytes.len() < 8 {
        return false;
    }

    // Verify TIFF little-endian byte order: "II\x2A\x00"
    match file_bytes.get(0..4) {
        Some([0x49, 0x49, 0x2A, 0x00]) => {}
        _ => return false,
    }

    let walk = || -> Option<bool> {
        // Read IFD0 offset from bytes 4-8
        let b: [u8; 4] = file_bytes.get(4..8)?.try_into().ok()?;
        let ifd0_offset = u32::from_le_bytes(b) as usize;

        // Find EXIF IFD (tag 0x8769) within IFD0
        let exif_ifd_offset = find_ifd_entry(file_bytes, ifd0_offset, 0x8769)? as usize;

        // Find MakerNote (tag 0x927C) within EXIF IFD
        let maker_note_offset = find_ifd_entry(file_bytes, exif_ifd_offset, 0x927C)? as usize;

        // Find multiple-exposure block (tag 0x4021) within MakerNote
        let multi_exp_block_offset =
            find_ifd_entry(file_bytes, maker_note_offset, 0x4021)? as usize;

        // The flag is a 4-byte value at offset +4 within the block
        let flag_offset = multi_exp_block_offset + 4;
        let v: [u8; 4] = file_bytes
            .get(flag_offset..flag_offset + 4)?
            .try_into()
            .ok()?;

        Some(u32::from_le_bytes(v) == 1)
    };

    walk().unwrap_or(false)
}

/// Find a specific tag ID within a TIFF IFD entry.
///
/// TIFF IFD format: 2-byte entry count, followed by 12-byte entries.
/// Each entry: 2-byte tag, 2-byte type, 4-byte count, 4-byte value/offset.
fn find_ifd_entry(file_bytes: &[u8], ifd_offset: usize, tag_id: u16) -> Option<u32> {
    let rd16 = |offset: usize| -> Option<u16> {
        let b: [u8; 2] = file_bytes.get(offset..offset + 2)?.try_into().ok()?;
        Some(u16::from_le_bytes(b))
    };

    let rd32 = |offset: usize| -> Option<u32> {
        let b: [u8; 4] = file_bytes.get(offset..offset + 4)?.try_into().ok()?;
        Some(u32::from_le_bytes(b))
    };

    let entry_count = rd16(ifd_offset)? as usize;
    // Safety cap to prevent runaway loops on corrupt data
    let capped_count = entry_count.min(512);

    for i in 0..capped_count {
        let entry_offset = ifd_offset + 2 + i * 12;
        let tag = rd16(entry_offset)?;
        if tag == tag_id {
            return rd32(entry_offset + 8);
        }
    }

    None
}

/// Neutralize white balance coefficients if the file is an in-camera multiple exposure.
///
/// Canon's in-camera multiple exposure feature produces unreliable white balance
/// coefficients because the camera merges multiple frames with potentially different
/// lighting conditions. This function detects such files and sets all WB coefficients
/// to 1.0 (neutral), forcing a neutral starting point for subsequent adjustment.
///
/// # Arguments
/// * `wb_coeffs` - The original white balance coefficients [R, G, B, G2].
/// * `file_bytes` - Raw bytes of the image file.
///
/// # Returns
/// Neutralized coefficients (all 1.0) if multiple exposure is detected,
/// otherwise the original coefficients unchanged.
#[allow(dead_code)]
pub fn neutralize_wb_if_multiexposure(wb_coeffs: [f32; 4], file_bytes: &[u8]) -> [f32; 4] {
    if is_incamera_multiexposure_canon(file_bytes) {
        log::info!("[raw_hdr_wb] multi-exposure CR2 detected, neutralizing WB");
        let mut neutralized = wb_coeffs;
        for exp in &mut neutralized {
            if exp.is_finite() {
                *exp = 1.0;
            }
        }
        neutralized
    } else {
        wb_coeffs
    }
}

/// Neutralize white balance in an adjustments JSON document when the source
/// file is a Canon in-camera multiple exposure.
///
/// This codebase applies white balance via `color.temperature` / `color.tint`
/// slider values (computed from the camera's As-Shot WB by the frontend, or
/// stored in the sidecar). Because the camera's WB is unreliable for
/// multi-exposure shots, this helper forces both sliders to 0 (neutral) so
/// the developed image starts from a neutral color point.
///
/// Only mutates existing `color` objects; missing keys are created so the
/// neutral state is explicit and survives round-trips to the sidecar.
#[allow(dead_code)]
pub fn neutralize_adjustments_wb_if_multiexposure(
    adjustments: &mut serde_json::Value,
    file_bytes: &[u8],
) -> bool {
    if !is_incamera_multiexposure_canon(file_bytes) {
        return false;
    }
    neutralize_adjustments_wb(adjustments);
    true
}

/// Unconditionally force `color.temperature` and `color.tint` to 0 (neutral)
/// in an adjustments JSON document. Callers must have already confirmed the
/// file is a multi-exposure shot (e.g. via `is_incamera_multiexposure_canon`
/// or the persisted `InCameraMultiExposure` EXIF flag).
pub fn neutralize_adjustments_wb(adjustments: &mut serde_json::Value) {
    if adjustments.is_null() {
        *adjustments = serde_json::json!({});
    }
    if adjustments.get("color").is_none() {
        adjustments["color"] = serde_json::json!({});
    }
    if let Some(color) = adjustments.get_mut("color").and_then(|c| c.as_object_mut()) {
        color.insert("temperature".to_string(), serde_json::json!(0));
        color.insert("tint".to_string(), serde_json::json!(0));
        log::info!("[raw_hdr_wb] neutralizing color.temperature/tint for multi-exposure file");
    }
}
