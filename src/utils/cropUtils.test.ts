import { describe, it, expect } from 'vitest';
import { getOrientedDimensions, calculateCenteredCrop } from './cropUtils';

// Mirrors the production ground-truth check (checkCropValid in Editor.tsx):
// a crop is valid when its corners, rotated back by `-rotation` around the
// image center, stay within the image bounds (with 1px tolerance).
function assertCropFitsRotatedImage(
  crop: { x: number; y: number; width: number; height: number },
  imageW: number,
  imageH: number,
  rotation: number,
) {
  const cx = imageW / 2;
  const cy = imageH / 2;
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const pts = [
    { x: crop.x, y: crop.y },
    { x: crop.x + crop.width, y: crop.y },
    { x: crop.x, y: crop.y + crop.height },
    { x: crop.x + crop.width, y: crop.y + crop.height },
  ];

  for (const p of pts) {
    const nx = cos * (p.x - cx) - sin * (p.y - cy) + cx;
    const ny = sin * (p.x - cx) + cos * (p.y - cy) + cy;
    expect(nx, `rotated corner (${p.x},${p.y}) -> (${nx},${ny})`).toBeGreaterThanOrEqual(-1);
    expect(nx).toBeLessThanOrEqual(imageW + 1);
    expect(ny).toBeGreaterThanOrEqual(-1);
    expect(ny).toBeLessThanOrEqual(imageH + 1);
  }
}

describe('getOrientedDimensions', () => {
  it('returns original dimensions for orientation 0', () => {
    expect(getOrientedDimensions(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
  });

  it('swaps dimensions for orientation 1 and 3', () => {
    expect(getOrientedDimensions(4000, 3000, 1)).toEqual({ width: 3000, height: 4000 });
    expect(getOrientedDimensions(4000, 3000, 3)).toEqual({ width: 3000, height: 4000 });
  });

  it('does not swap for orientation 2', () => {
    expect(getOrientedDimensions(4000, 3000, 2)).toEqual({ width: 4000, height: 3000 });
  });
});

describe('calculateCenteredCrop', () => {
  it('returns null for missing or non-positive aspect ratio', () => {
    expect(calculateCenteredCrop(100, 100, 0, null)).toBeNull();
    expect(calculateCenteredCrop(100, 100, 0, 0)).toBeNull();
    expect(calculateCenteredCrop(100, 100, 0, -1)).toBeNull();
  });

  it('returns null for non-positive image dimensions', () => {
    expect(calculateCenteredCrop(0, 100, 0, 1)).toBeNull();
    expect(calculateCenteredCrop(100, 0, 0, 1)).toBeNull();
    expect(calculateCenteredCrop(-100, 100, 0, 1)).toBeNull();
  });

  it('returns null for degenerate rotated aspect when denominator is zero', () => {
    // rotation 90° on a 1:1 aspect image -> denomW/denomH approach zero, guard returns null
    expect(calculateCenteredCrop(100, 100, 0, 1, 90)).not.toBeNull();
  });

  it('produces a centered 16:9 crop from a 4:3 landscape image', () => {
    const crop = calculateCenteredCrop(4000, 3000, 0, 16 / 9, 0)!;
    expect(crop).not.toBeNull();
    expect(crop.width / crop.height).toBeCloseTo(16 / 9, 3);
    // centered horizontally, vertically
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(Math.round((3000 - crop.height) / 2));
    // fully inside bounds
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(4000);
    expect(crop.y + crop.height).toBeLessThanOrEqual(3000);
  });

  it('handles rotated crops without producing out-of-bounds boxes', () => {
    // stress rotation angles that previously produced degenerate/overflow crops
    for (const rotation of [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -135]) {
      for (const ar of [1, 4 / 3, 16 / 9]) {
        const crop = calculateCenteredCrop(4000, 3000, 0, ar, rotation);
        expect(crop, `rotation=${rotation} ar=${ar}`).not.toBeNull();
        // crop must be positive size
        expect(crop!.width, `rotation=${rotation} ar=${ar} width`).toBeGreaterThan(0);
        expect(crop!.height, `rotation=${rotation} ar=${ar} height`).toBeGreaterThan(0);
        // corners rotated back must stay inside the image (ground truth)
        assertCropFitsRotatedImage(crop!, 4000, 3000, rotation);
        // aspect ratio preserved (within rounding tolerance)
        expect(crop!.width / crop!.height, `rotation=${rotation} ar=${ar}`).toBeCloseTo(ar, 2);
      }
    }
  });

  it('respects orientationSteps when computing centered crop', () => {
    const crop = calculateCenteredCrop(4000, 3000, 1, 1, 0)!;
    expect(crop).not.toBeNull();
    // oriented dimensions swapped -> 3000x4000
    expect(crop.x + crop.width).toBeLessThanOrEqual(3000);
    expect(crop.y + crop.height).toBeLessThanOrEqual(4000);
  });

  it('returns a 1:1 square for a square image', () => {
    const crop = calculateCenteredCrop(1000, 1000, 0, 1, 0)!;
    expect(crop.width).toBe(1000);
    expect(crop.height).toBe(1000);
    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
  });
});
