import { Crop } from 'react-image-crop';

export function getOrientedDimensions(
  imageWidth: number,
  imageHeight: number,
  orientationSteps: number,
): { width: number; height: number } {
  const isSwapped = orientationSteps === 1 || orientationSteps === 3;
  return {
    width: isSwapped ? imageHeight : imageWidth,
    height: isSwapped ? imageWidth : imageHeight,
  };
}

export function calculateCenteredCrop(
  imageWidth: number,
  imageHeight: number,
  orientationSteps: number,
  aspectRatio: number | null,
  rotation: number = 0,
): Crop | null {
  if (!aspectRatio || aspectRatio <= 0 || !isFinite(aspectRatio)) return null;
  if (imageWidth <= 0 || imageHeight <= 0 || !isFinite(imageWidth) || !isFinite(imageHeight)) return null;

  const { width: W, height: H } = getOrientedDimensions(imageWidth, imageHeight, orientationSteps);
  if (W <= 0 || H <= 0 || !isFinite(W) || !isFinite(H)) return null;

  const angle = Math.abs(rotation);
  const rad = ((angle % 180) * Math.PI) / 180;
  if (!isFinite(rad)) return null;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  if (!isFinite(sin) || !isFinite(cos)) return null;

  const denomH = aspectRatio * sin + cos;
  const denomW = aspectRatio * cos + sin;
  // Use epsilon comparison instead of exact zero check for floating-point safety
  const EPSILON = 1e-10;
  if (Math.abs(denomH) < EPSILON || Math.abs(denomW) < EPSILON) return null;

  const h_c = Math.min(H / denomH, W / denomW);
  const w_c = aspectRatio * h_c;

  if (w_c <= 0 || h_c <= 0 || !isFinite(w_c) || !isFinite(h_c)) return null;

  // Clamp to ensure crop doesn't exceed image dimensions
  const clampedW = Math.min(w_c, W);
  const clampedH = Math.min(h_c, H);

  return {
    unit: 'px',
    x: Math.round((W - clampedW) / 2),
    y: Math.round((H - clampedH) / 2),
    width: Math.round(clampedW),
    height: Math.round(clampedH),
  };
}
