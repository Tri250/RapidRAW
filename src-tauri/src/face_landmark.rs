#[allow(clippy::collapsible_if)]
#[allow(clippy::unnecessary_cast)]

use std::path::Path;

use image::{DynamicImage, GenericImageView, Rgb, RgbImage};
use ndarray::{Array, Array4, IxDyn};
use ort::session::Session;
use ort::value::Tensor;

pub struct FaceDetection {
    pub bbox: (f32, f32, f32, f32), // x1, y1, x2, y2
    pub confidence: f32,
    pub kps5: [(f32, f32); 5], // 左眼, 右眼, 鼻尖, 左嘴角, 右嘴角
}

pub struct FaceLandmarks106 {
    pub bbox: (f32, f32, f32, f32),
    pub points: [(f32, f32); 106],
    pub confidence: f32,
}

// 106点索引定义 (InsightFace 2d106det 标准)
// 0-32: 轮廓 (33点)
// 33-42: 左眉 (10点)
// 43-52: 右眉 (10点)
// 53-72: 左眼 (20点)
// 73-92: 右眼 (20点)
// 93-96: 鼻梁 (4点)
// 97-106: 鼻尖 (10点)
// 107-116: 左鼻孔 (10点)
// 117-126: 右鼻孔 (10点)
// 127-134: 上嘴唇外轮廓 (8点)
// 135-142: 下嘴唇外轮廓 (8点)
// 143-150: 上嘴唇内轮廓 (8点)
// 151-158: 下嘴唇内轮廓 (8点)
//
// 注：以上语义分组基于 InsightFace 2d106det 的公开参考定义。

pub struct FaceLandmarkDetector {
    scrfd_session: Session,
    landmark_session: Session,
}

impl FaceLandmarkDetector {
    pub fn new(scrfd_path: &Path, landmark_path: &Path) -> Result<Self, String> {
        let scrfd_session = Session::builder()
            .map_err(|e| e.to_string())?
            .commit_from_file(scrfd_path)
            .map_err(|e| e.to_string())?;
        let landmark_session = Session::builder()
            .map_err(|e| e.to_string())?
            .commit_from_file(landmark_path)
            .map_err(|e| e.to_string())?;
        Ok(Self {
            scrfd_session,
            landmark_session,
        })
    }

    pub fn detect_faces(&mut self, img: &DynamicImage) -> Result<Vec<FaceDetection>, String> {
        let (orig_w, orig_h) = img.dimensions();
        let input_size = 640u32;

        // Letterbox resize: keep aspect ratio, pad with black
        let scale = (input_size as f32) / (orig_w.max(orig_h) as f32);
        let new_w = (orig_w as f32 * scale).round() as u32;
        let new_h = (orig_h as f32 * scale).round() as u32;
        let dx = ((input_size - new_w) / 2) as f32;
        let dy = ((input_size - new_h) / 2) as f32;

        let resized = img.resize(new_w, new_h, image::imageops::FilterType::Triangle);
        let mut input_tensor =
            Array4::<f32>::zeros((1, 3, input_size as usize, input_size as usize));

        for y in 0..new_h {
            for x in 0..new_w {
                let p = resized.get_pixel(x, y);
                let dest_x = (x as f32 + dx) as usize;
                let dest_y = (y as f32 + dy) as usize;
                if dest_x < input_size as usize && dest_y < input_size as usize {
                    input_tensor[[0, 0, dest_y, dest_x]] = p[0] as f32 / 255.0;
                    input_tensor[[0, 1, dest_y, dest_x]] = p[1] as f32 / 255.0;
                    input_tensor[[0, 2, dest_y, dest_x]] = p[2] as f32 / 255.0;
                }
            }
        }

        let t_input = Tensor::from_array(
            input_tensor
                .into_shape_with_order((1, 3, input_size as usize, input_size as usize))
                .map_err(|e| format!("Tensor reshape failed: {}", e))?
                .into_dyn()
                .as_standard_layout()
                .into_owned(),
        )
        .map_err(|e| e.to_string())?;

        let outputs = self
            .scrfd_session
            .run(ort::inputs![t_input])
            .map_err(|e| e.to_string())?;

        // Use outputs.len() instead of self.scrfd_session.outputs.len()
        // to avoid borrow conflict with the mutable borrow from run()
        let output_count = outputs.len();
        let mut scores: Vec<Array<f32, IxDyn>> = Vec::new();
        let mut bboxes: Vec<Array<f32, IxDyn>> = Vec::new();
        let mut kpss: Vec<Array<f32, IxDyn>> = Vec::new();

        for i in 0..output_count {
            let arr = outputs[i]
                .try_extract_array::<f32>()
                .map_err(|e| e.to_string())?
                .to_owned();
            let shape = arr.shape();
            if shape.len() != 3 || shape[0] != 1 {
                continue;
            }
            match shape[2] {
                1 => scores.push(arr),
                4 => bboxes.push(arr),
                10 => kpss.push(arr),
                _ => {}
            }
        }

        #[derive(Default)]
        struct HeadArrays {
            score: Option<Array<f32, IxDyn>>,
            bbox: Option<Array<f32, IxDyn>>,
            kps: Option<Array<f32, IxDyn>>,
        }

        let mut by_n: std::collections::HashMap<usize, HeadArrays> =
            std::collections::HashMap::new();

        for arr in scores {
            let n = arr.shape()[1];
            by_n.entry(n).or_default().score = Some(arr);
        }
        for arr in bboxes {
            let n = arr.shape()[1];
            by_n.entry(n).or_default().bbox = Some(arr);
        }
        for arr in kpss {
            let n = arr.shape()[1];
            by_n.entry(n).or_default().kps = Some(arr);
        }

        let mut candidates: Vec<(f32, [f32; 4], [f32; 10])> = Vec::new();

        for (n, head) in by_n {
            let score_arr = match head.score {
                Some(a) => a,
                None => continue,
            };
            let bbox_arr = match head.bbox {
                Some(a) => a,
                None => continue,
            };
            let kps_arr = match head.kps {
                Some(a) => a,
                None => continue,
            };

            let stride = ((input_size as f32) / ((n as f32).sqrt())).round() as u32;
            if stride == 0 {
                continue;
            }
            let grid_w = input_size / stride;
            let grid_h = input_size / stride;

            for i in 0..n {
                let score_val = score_arr[[0, i, 0]];
                if score_val < 0.5 {
                    continue;
                }

                let grid_x = (i as u32) % grid_w;
                let grid_y = (i as u32) / grid_w;
                let cx = (grid_x as f32 + 0.5) * stride as f32;
                let cy = (grid_y as f32 + 0.5) * stride as f32;

                let dx = bbox_arr[[0, i, 0]];
                let dy = bbox_arr[[0, i, 1]];
                let dw = bbox_arr[[0, i, 2]];
                let dh = bbox_arr[[0, i, 3]];
                let bbox_cx = cx + dx * stride as f32;
                let bbox_cy = cy + dy * stride as f32;
                let bw = dw.exp() * stride as f32;
                let bh = dh.exp() * stride as f32;
                let x1 = bbox_cx - bw * 0.5;
                let y1 = bbox_cy - bh * 0.5;
                let x2 = bbox_cx + bw * 0.5;
                let y2 = bbox_cy + bh * 0.5;

                let mut kps5 = [0.0f32; 10];
                for j in 0..5 {
                    let kx = cx + kps_arr[[0, i, j * 2]] * stride as f32;
                    let ky = cy + kps_arr[[0, i, j * 2 + 1]] * stride as f32;
                    kps5[j * 2] = kx;
                    kps5[j * 2 + 1] = ky;
                }

                candidates.push((score_val, [x1, y1, x2, y2], kps5));
            }
        }

        // NMS
        candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let mut suppressed = vec![false; candidates.len()];
        let mut result = Vec::new();

        for i in 0..candidates.len() {
            if suppressed[i] {
                continue;
            }
            let (conf, bbox, kps) = candidates[i];
            let mut kps5 = [(0.0f32, 0.0f32); 5];
            for j in 0..5 {
                let x = (kps[j * 2] - dx) / scale;
                let y = (kps[j * 2 + 1] - dy) / scale;
                kps5[j] = (x, y);
            }
            result.push(FaceDetection {
                bbox: (
                    (bbox[0] - dx) / scale,
                    (bbox[1] - dy) / scale,
                    (bbox[2] - dx) / scale,
                    (bbox[3] - dy) / scale,
                ),
                confidence: conf,
                kps5,
            });

            for j in (i + 1)..candidates.len() {
                if suppressed[j] {
                    continue;
                }
                let (_, bbox_j, _) = candidates[j];
                if iou(bbox, bbox_j) > 0.4 {
                    suppressed[j] = true;
                }
            }
        }

        Ok(result)
    }

    pub fn detect_landmarks_106(
        &mut self,
        img: &DynamicImage,
        face: &FaceDetection,
    ) -> Result<FaceLandmarks106, String> {
        let (orig_w, orig_h) = img.dimensions();
        let input_size_f = 192.0f32;

        // Standard 5-point template for 112x112 ArcFace alignment, scaled to 192x192
        let scale_factor = input_size_f / 112.0;
        let template_112: [(f32, f32); 5] = [
            (38.2946, 51.6963),
            (73.5318, 51.5014),
            (56.0252, 71.7366),
            (41.5493, 92.3655),
            (70.7299, 92.2041),
        ];
        let dst_pts: Vec<(f32, f32)> = template_112
            .iter()
            .map(|(x, y)| (x * scale_factor, y * scale_factor))
            .collect();
        let src_pts: Vec<(f32, f32)> = face.kps5.to_vec();

        // Compute affine transform from dst (192x192) to src (original image)
        let mat = estimate_affine_transform(&dst_pts, &src_pts)?;

        // Warp source image to 192x192 using bilinear interpolation
        let rgb = img.to_rgb8();
        let mut warped = RgbImage::new(192, 192);
        for y in 0..192u32 {
            for x in 0..192u32 {
                let src_x = mat[0][0] * x as f32 + mat[0][1] * y as f32 + mat[0][2];
                let src_y = mat[1][0] * x as f32 + mat[1][1] * y as f32 + mat[1][2];
                let px = sample_bilinear_rgb(&rgb, orig_w, orig_h, src_x, src_y);
                warped.put_pixel(x, y, px);
            }
        }

        // Normalize to -1 ~ 1
        let mut input_tensor = Array4::<f32>::zeros((1, 3, 192, 192));
        for y in 0..192u32 {
            for x in 0..192u32 {
                let p = warped.get_pixel(x, y);
                let r = p[0] as f32 / 127.5 - 1.0;
                let g = p[1] as f32 / 127.5 - 1.0;
                let b = p[2] as f32 / 127.5 - 1.0;
                input_tensor[[0, 0, y as usize, x as usize]] = r;
                input_tensor[[0, 1, y as usize, x as usize]] = g;
                input_tensor[[0, 2, y as usize, x as usize]] = b;
            }
        }

        let t_input = Tensor::from_array(
            input_tensor
                .into_shape_with_order((1, 3, 192, 192))
                .map_err(|e| format!("Landmark tensor reshape failed: {}", e))?
                .into_dyn()
                .as_standard_layout()
                .into_owned(),
        )
        .map_err(|e| e.to_string())?;

        let outputs = self
            .landmark_session
            .run(ort::inputs![t_input])
            .map_err(|e| e.to_string())?;

        let arr = outputs[0]
            .try_extract_array::<f32>()
            .map_err(|e| e.to_string())?
            .to_owned();
        let shape = arr.shape().to_vec();

        let mut points = [(0.0f32, 0.0f32); 106];

        let extract_and_map = |slice: &[f32]| {
            let mut pts = [(0.0f32, 0.0f32); 106];
            for i in 0..106 {
                let x = slice[i * 2];
                let y = slice[i * 2 + 1];
                // x, y are normalized to 0-1 within the 192x192 cropped face
                let dst_x = x * input_size_f;
                let dst_y = y * input_size_f;
                let orig_x = mat[0][0] * dst_x + mat[0][1] * dst_y + mat[0][2];
                let orig_y = mat[1][0] * dst_x + mat[1][1] * dst_y + mat[1][2];
                pts[i] = (orig_x, orig_y);
            }
            pts
        };

        if shape.len() == 2 && shape[1] == 212 {
            let slice = arr.as_slice().ok_or("Failed to get array slice")?;
            points = extract_and_map(slice);
        } else if shape.len() == 3 && shape[1] == 106 && shape[2] == 2 {
            let slice = arr.as_slice().ok_or("Failed to get array slice")?;
            points = extract_and_map(slice);
        } else {
            return Err(format!("Unexpected landmark output shape: {:?}", shape));
        }

        Ok(FaceLandmarks106 {
            bbox: face.bbox,
            points,
            confidence: face.confidence,
        })
    }

    pub fn detect_all(&mut self, img: &DynamicImage) -> Result<Vec<FaceLandmarks106>, String> {
        let faces = self.detect_faces(img)?;
        let mut results = Vec::new();
        for face in &faces {
            results.push(self.detect_landmarks_106(img, face)?);
        }
        Ok(results)
    }
}

fn iou(a: [f32; 4], b: [f32; 4]) -> f32 {
    let x1 = a[0].max(b[0]);
    let y1 = a[1].max(b[1]);
    let x2 = a[2].min(b[2]);
    let y2 = a[3].min(b[3]);
    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = (a[2] - a[0]) * (a[3] - a[1]);
    let area_b = (b[2] - b[0]) * (b[3] - b[1]);
    let union = area_a + area_b - inter;
    if union <= 0.0 { 0.0 } else { inter / union }
}

fn sample_bilinear_rgb(img: &RgbImage, w: u32, h: u32, x: f32, y: f32) -> Rgb<u8> {
    let x0 = x.floor().clamp(0.0, (w.saturating_sub(1)) as f32) as u32;
    let y0 = y.floor().clamp(0.0, (h.saturating_sub(1)) as f32) as u32;
    let x1 = (x0 + 1).min(w.saturating_sub(1));
    let y1 = (y0 + 1).min(h.saturating_sub(1));
    let fx = (x - x0 as f32).clamp(0.0, 1.0);
    let fy = (y - y0 as f32).clamp(0.0, 1.0);

    let p00 = img.get_pixel(x0, y0);
    let p10 = img.get_pixel(x1, y0);
    let p01 = img.get_pixel(x0, y1);
    let p11 = img.get_pixel(x1, y1);

    let mut c = [0u8; 3];
    for i in 0..3 {
        let v00 = p00[i] as f32;
        let v10 = p10[i] as f32;
        let v01 = p01[i] as f32;
        let v11 = p11[i] as f32;
        let v = (v00 * (1.0 - fx) + v10 * fx) * (1.0 - fy) + (v01 * (1.0 - fx) + v11 * fx) * fy;
        c[i] = v.round().clamp(0.0, 255.0) as u8;
    }
    Rgb(c)
}

fn estimate_affine_transform(
    src: &[(f32, f32)],
    dst: &[(f32, f32)],
) -> Result<[[f32; 3]; 2], String> {
    let n = src.len();
    if n < 3 || n != dst.len() {
        return Err("Need at least 3 matching point pairs".to_string());
    }

    let mut a_data = Vec::with_capacity(2 * n * 6);
    let mut b_data = Vec::with_capacity(2 * n);

    for i in 0..n {
        let (sx, sy) = src[i];
        let (dx, dy) = dst[i];
        a_data.extend_from_slice(&[sx, sy, 1.0, 0.0, 0.0, 0.0]);
        b_data.push(dx);
        a_data.extend_from_slice(&[0.0, 0.0, 0.0, sx, sy, 1.0]);
        b_data.push(dy);
    }

    let a = nalgebra::DMatrix::from_row_slice(2 * n, 6, &a_data);
    let b = nalgebra::DVector::from_row_slice(&b_data);

    let svd = nalgebra::SVD::new(a, true, true);
    let x = svd
        .solve(&b, 1e-6)
        .map_err(|_| "Failed to solve affine transform via SVD".to_string())?;

    Ok([[x[0], x[1], x[2]], [x[3], x[4], x[5]]])
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn test_iou_identical() {
        let a = [0.0, 0.0, 10.0, 10.0];
        let b = [0.0, 0.0, 10.0, 10.0];
        assert!((iou(a, b) - 1.0).abs() < 1e-5);
    }

    #[test]
    fn test_iou_no_overlap() {
        let a = [0.0, 0.0, 10.0, 10.0];
        let b = [20.0, 20.0, 30.0, 30.0];
        assert_eq!(iou(a, b), 0.0);
    }

    #[test]
    fn test_iou_partial_overlap() {
        let a = [0.0, 0.0, 10.0, 10.0];
        let b = [5.0, 5.0, 15.0, 15.0];
        let inter = 5.0 * 5.0;
        let union = 100.0 + 100.0 - inter;
        let expected = inter / union;
        assert!((iou(a, b) - expected).abs() < 1e-5);
    }

    #[test]
    fn test_estimate_affine_transform_minimal() {
        let src = vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)];
        let dst = vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)];
        let mat = estimate_affine_transform(&src, &dst).unwrap();
        assert!((mat[0][0] - 1.0).abs() < 1e-3);
        assert!((mat[1][1] - 1.0).abs() < 1e-3);
        assert!((mat[0][2]).abs() < 1e-3);
        assert!((mat[1][2]).abs() < 1e-3);
    }

    #[test]
    fn test_estimate_affine_transform_insufficient_points() {
        let src = vec![(0.0, 0.0), (1.0, 0.0)];
        let dst = vec![(0.0, 0.0), (1.0, 0.0)];
        assert!(estimate_affine_transform(&src, &dst).is_err());
    }

    #[test]
    fn test_sample_bilinear_rgb_clamps() {
        let img = RgbImage::from_pixel(2, 2, Rgb([128, 64, 32]));
        let px = sample_bilinear_rgb(&img, 2, 2, -1.0, -1.0);
        assert_eq!(px[0], 128);
        let px2 = sample_bilinear_rgb(&img, 2, 2, 5.0, 5.0);
        assert_eq!(px2[0], 128);
    }
}
