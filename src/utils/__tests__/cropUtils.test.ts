import { describe, it, expect } from 'vitest';
import { getOrientedDimensions, calculateCenteredCrop } from '../cropUtils';

describe('getOrientedDimensions', () => {
  it('orientationSteps 为 0 时，宽高不变', () => {
    const result = getOrientedDimensions(100, 200, 0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
  });

  it('orientationSteps 为 1 时，宽高交换', () => {
    const result = getOrientedDimensions(100, 200, 1);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('orientationSteps 为 2 时，宽高不变', () => {
    const result = getOrientedDimensions(100, 200, 2);
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
  });

  it('orientationSteps 为 3 时，宽高交换', () => {
    const result = getOrientedDimensions(100, 200, 3);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it('正方形图片在任何 orientationSteps 下宽高都相同', () => {
    for (let steps = 0; steps < 4; steps++) {
      const result = getOrientedDimensions(300, 300, steps);
      expect(result.width).toBe(300);
      expect(result.height).toBe(300);
    }
  });

  it('边界情况：0x0 尺寸', () => {
    const result0 = getOrientedDimensions(0, 0, 0);
    expect(result0.width).toBe(0);
    expect(result0.height).toBe(0);

    const result1 = getOrientedDimensions(0, 0, 1);
    expect(result1.width).toBe(0);
    expect(result1.height).toBe(0);
  });

  it('边界情况：宽度为 0', () => {
    const result = getOrientedDimensions(0, 500, 1);
    expect(result.width).toBe(500);
    expect(result.height).toBe(0);
  });

  it('边界情况：高度为 0', () => {
    const result = getOrientedDimensions(500, 0, 1);
    expect(result.width).toBe(0);
    expect(result.height).toBe(500);
  });

  it('边界情况：超大尺寸', () => {
    const largeWidth = 10000;
    const largeHeight = 20000;
    const result = getOrientedDimensions(largeWidth, largeHeight, 1);
    expect(result.width).toBe(largeHeight);
    expect(result.height).toBe(largeWidth);
  });

  it('边界情况：1x1 像素', () => {
    const result = getOrientedDimensions(1, 1, 3);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });
});

describe('calculateCenteredCrop', () => {
  it('aspectRatio 为 null 时返回 null', () => {
    const result = calculateCenteredCrop(800, 600, 0, null);
    expect(result).toBeNull();
  });

  it('aspectRatio 为 0 时返回 null', () => {
    const result = calculateCenteredCrop(800, 600, 0, 0);
    expect(result).toBeNull();
  });

  it('aspectRatio 小于 0 时返回 null', () => {
    const result = calculateCenteredCrop(800, 600, 0, -1);
    expect(result).toBeNull();
  });

  it('aspectRatio 为负数时返回 null', () => {
    const result = calculateCenteredCrop(800, 600, 0, -16 / 9);
    expect(result).toBeNull();
  });

  it('返回的 Crop 对象有正确的 unit', () => {
    const result = calculateCenteredCrop(800, 600, 0, 1);
    expect(result).not.toBeNull();
    expect(result?.unit).toBe('px');
  });

  it('返回的 Crop 对象有 x, y, width, height 属性', () => {
    const result = calculateCenteredCrop(800, 600, 0, 1);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(typeof result?.x).toBe('number');
    expect(typeof result?.y).toBe('number');
    expect(typeof result?.width).toBe('number');
    expect(typeof result?.height).toBe('number');
  });

  it('验证 x + width <= 图像宽度，y + height <= 图像高度', () => {
    const testCases = [
      { w: 800, h: 600, ratio: 1 },
      { w: 800, h: 600, ratio: 16 / 9 },
      { w: 800, h: 600, ratio: 4 / 3 },
      { w: 600, h: 800, ratio: 1 },
      { w: 1000, h: 500, ratio: 2 },
      { w: 500, h: 1000, ratio: 0.5 },
    ];

    for (const { w, h, ratio } of testCases) {
      const result = calculateCenteredCrop(w, h, 0, ratio);
      expect(result).not.toBeNull();
      expect(result!.x + result!.width).toBeLessThanOrEqual(w);
      expect(result!.y + result!.height).toBeLessThanOrEqual(h);
      expect(result!.x).toBeGreaterThanOrEqual(0);
      expect(result!.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('验证宽高比正确（宽图，正方形裁剪）', () => {
    const result = calculateCenteredCrop(800, 600, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.width / result!.height).toBeCloseTo(1, 0);
  });

  it('验证宽高比正确（高图，正方形裁剪）', () => {
    const result = calculateCenteredCrop(600, 800, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.width / result!.height).toBeCloseTo(1, 0);
  });

  it('验证宽高比正确（16:9 宽屏裁剪）', () => {
    const result = calculateCenteredCrop(1920, 1080, 0, 16 / 9);
    expect(result).not.toBeNull();
    expect(result!.width / result!.height).toBeCloseTo(16 / 9, 1);
  });

  it('验证宽高比正确（4:3 裁剪）', () => {
    const result = calculateCenteredCrop(800, 600, 0, 4 / 3);
    expect(result).not.toBeNull();
    expect(result!.width / result!.height).toBeCloseTo(4 / 3, 1);
  });

  it('验证居中（x ≈ (W-w)/2, y ≈ (H-h)/2）', () => {
    const W = 800;
    const H = 600;
    const result = calculateCenteredCrop(W, H, 0, 1);
    expect(result).not.toBeNull();
    const expectedX = (W - result!.width) / 2;
    const expectedY = (H - result!.height) / 2;
    expect(result!.x).toBeCloseTo(expectedX, 0);
    expect(result!.y).toBeCloseTo(expectedY, 0);
  });

  it('验证宽图正方形裁剪正确（上下裁剪，左右为0）', () => {
    const W = 800;
    const H = 600;
    const result = calculateCenteredCrop(W, H, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(600);
    expect(result!.height).toBe(600);
    expect(result!.x).toBe(100);
    expect(result!.y).toBe(0);
  });

  it('验证高图正方形裁剪正确（左右裁剪，上下为0）', () => {
    const W = 600;
    const H = 800;
    const result = calculateCenteredCrop(W, H, 0, 1);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(600);
    expect(result!.height).toBe(600);
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(100);
  });

  it('验证与图像相同比例时返回全图', () => {
    const result = calculateCenteredCrop(800, 600, 0, 4 / 3);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(0);
    expect(result!.y).toBe(0);
    expect(result!.width).toBe(800);
    expect(result!.height).toBe(600);
  });

  describe('不同 orientationSteps 的情况', () => {
    it('orientationSteps 为 0 时正常计算', () => {
      const result = calculateCenteredCrop(800, 600, 0, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(600);
      expect(result!.height).toBe(600);
    });

    it('orientationSteps 为 1 时宽高交换后计算', () => {
      const result = calculateCenteredCrop(800, 600, 1, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(600);
      expect(result!.height).toBe(600);
    });

    it('orientationSteps 为 2 时正常计算', () => {
      const result = calculateCenteredCrop(800, 600, 2, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(600);
      expect(result!.height).toBe(600);
    });

    it('orientationSteps 为 3 时宽高交换后计算', () => {
      const result = calculateCenteredCrop(800, 600, 3, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(600);
      expect(result!.height).toBe(600);
    });

    it('不同 orientationSteps 下裁剪区域比例正确', () => {
      const ratio = 16 / 9;
      for (let steps = 0; steps < 4; steps++) {
        const result = calculateCenteredCrop(1920, 1080, steps, ratio);
        expect(result).not.toBeNull();
        expect(result!.width / result!.height).toBeCloseTo(ratio, 1);
      }
    });
  });

  describe('有 rotation 角度的情况', () => {
    it('rotation 为 0 度时正常裁剪', () => {
      const result = calculateCenteredCrop(800, 600, 0, 1, 0);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(600);
      expect(result!.height).toBe(600);
    });

    it('rotation 为 45 度时返回有效裁剪区域', () => {
      const result = calculateCenteredCrop(800, 600, 0, 1, 45);
      expect(result).not.toBeNull();
      expect(result!.x + result!.width).toBeLessThanOrEqual(800);
      expect(result!.y + result!.height).toBeLessThanOrEqual(600);
      expect(result!.width).toBeGreaterThan(0);
      expect(result!.height).toBeGreaterThan(0);
    });

    it('rotation 为 90 度时返回有效裁剪区域', () => {
      const result = calculateCenteredCrop(800, 600, 0, 1, 90);
      expect(result).not.toBeNull();
      expect(result!.x + result!.width).toBeLessThanOrEqual(800);
      expect(result!.y + result!.height).toBeLessThanOrEqual(600);
    });

    it('rotation 为负角度时与正角度结果相同（取绝对值）', () => {
      const resultPos = calculateCenteredCrop(800, 600, 0, 1, 45);
      const resultNeg = calculateCenteredCrop(800, 600, 0, 1, -45);
      expect(resultPos).toEqual(resultNeg);
    });

    it('rotation 为 180 度时与 0 度结果相同', () => {
      const result0 = calculateCenteredCrop(800, 600, 0, 1, 0);
      const result180 = calculateCenteredCrop(800, 600, 0, 1, 180);
      expect(result0).toEqual(result180);
    });

    it('rotation 为 270 度时与 90 度结果相同（取模 180）', () => {
      const result90 = calculateCenteredCrop(800, 600, 0, 1, 90);
      const result270 = calculateCenteredCrop(800, 600, 0, 1, 270);
      expect(result90).toEqual(result270);
    });

    it('rotation 为 30 度时宽高比正确', () => {
      const ratio = 1;
      const result = calculateCenteredCrop(800, 600, 0, ratio, 30);
      expect(result).not.toBeNull();
      expect(result!.width / result!.height).toBeCloseTo(ratio, 0);
    });

    it('rotation 为 60 度时裁剪区域居中', () => {
      const W = 800;
      const H = 600;
      const result = calculateCenteredCrop(W, H, 0, 1, 60);
      expect(result).not.toBeNull();
      const leftMargin = result!.x;
      const rightMargin = W - result!.x - result!.width;
      const topMargin = result!.y;
      const bottomMargin = H - result!.y - result!.height;
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(1);
      expect(Math.abs(topMargin - bottomMargin)).toBeLessThanOrEqual(1);
    });
  });

  describe('各种图像尺寸和宽高比组合', () => {
    it('宽图 + 更宽比例（限制高度，用满宽度）', () => {
      const result = calculateCenteredCrop(1920, 1080, 0, 21 / 9);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(21 / 9, 1);
    });

    it('宽图 + 更高比例（限制宽度，用满高度）', () => {
      const result = calculateCenteredCrop(1920, 1080, 0, 4 / 5);
      expect(result).not.toBeNull();
      expect(result!.y).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(4 / 5, 1);
    });

    it('高图 + 更宽比例（限制高度，用满宽度）', () => {
      const result = calculateCenteredCrop(1080, 1920, 0, 16 / 9);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(16 / 9, 1);
    });

    it('高图 + 更高比例（限制宽度，用满高度）', () => {
      const result = calculateCenteredCrop(1080, 1920, 0, 1 / 2);
      expect(result).not.toBeNull();
      expect(result!.y).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(1 / 2, 1);
    });

    it('正方形图 + 宽比例', () => {
      const result = calculateCenteredCrop(500, 500, 0, 2);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(2, 0);
    });

    it('正方形图 + 高比例', () => {
      const result = calculateCenteredCrop(500, 500, 0, 0.5);
      expect(result).not.toBeNull();
      expect(result!.y).toBe(0);
      expect(result!.width / result!.height).toBeCloseTo(0.5, 0);
    });

    it('非常宽的图', () => {
      const result = calculateCenteredCrop(3000, 500, 0, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(500);
      expect(result!.height).toBe(500);
      expect(result!.y).toBe(0);
    });

    it('非常高的图', () => {
      const result = calculateCenteredCrop(500, 3000, 0, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(500);
      expect(result!.height).toBe(500);
      expect(result!.x).toBe(0);
    });

    it('小尺寸图片', () => {
      const result = calculateCenteredCrop(100, 50, 0, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(50);
      expect(result!.height).toBe(50);
      expect(result!.x + result!.width).toBeLessThanOrEqual(100);
      expect(result!.y + result!.height).toBeLessThanOrEqual(50);
    });
  });

  describe('边界值测试', () => {
    it('aspectRatio 非常接近 0 但大于 0 时返回有效结果', () => {
      const result = calculateCenteredCrop(800, 600, 0, 0.001);
      expect(result).not.toBeNull();
      expect(result!.width).toBeGreaterThan(0);
      expect(result!.height).toBeGreaterThan(0);
    });

    it('aspectRatio 非常大时返回有效结果', () => {
      const result = calculateCenteredCrop(800, 600, 0, 1000);
      expect(result).not.toBeNull();
      expect(result!.width).toBeGreaterThan(0);
      expect(result!.height).toBeGreaterThan(0);
    });

    it('width 和 height 为 0 时', () => {
      const result = calculateCenteredCrop(0, 0, 0, 1);
      expect(result).not.toBeNull();
      expect(result!.width).toBe(0);
      expect(result!.height).toBe(0);
    });
  });
});
