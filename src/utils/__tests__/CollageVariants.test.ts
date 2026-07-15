import { describe, it, expect } from 'vitest';
import { LAYOUTS, type LayoutCell, type Layout, type LayoutDefinition } from '../CollageVariants';

const expectLayoutCell = (cell: LayoutCell) => {
  expect(cell).toBeDefined();
  expect(typeof cell.x).toBe('number');
  expect(typeof cell.y).toBe('number');
  expect(typeof cell.width).toBe('number');
  expect(typeof cell.height).toBe('number');
  expect(cell.x).toBeGreaterThanOrEqual(0);
  expect(cell.y).toBeGreaterThanOrEqual(0);
  expect(cell.x + cell.width).toBeLessThanOrEqual(1.0001);
  expect(cell.y + cell.height).toBeLessThanOrEqual(1.0001);
  expect(cell.width).toBeGreaterThan(0);
  expect(cell.height).toBeGreaterThan(0);
};

const calculateTotalArea = (layout: Layout): number => {
  return layout.reduce((sum, cell) => sum + cell.width * cell.height, 0);
};

describe('LAYOUTS 常量', () => {
  it('包含 1-9 共 9 个图片数量的键', () => {
    const keys = Object.keys(LAYOUTS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('每个数量对应的值是非空数组', () => {
    for (let i = 1; i <= 9; i++) {
      expect(Array.isArray(LAYOUTS[i])).toBe(true);
      expect(LAYOUTS[i].length).toBeGreaterThan(0);
    }
  });

  it('每个布局定义包含 layout 和 icon 字段', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        expect(layoutDef).toBeDefined();
        expect(layoutDef.layout).toBeDefined();
        expect(layoutDef.icon).toBeDefined();
      });
    }
  });

  it('每个布局的 layout 是一个数组', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        expect(Array.isArray(layoutDef.layout)).toBe(true);
      });
    }
  });

  it('每个 LayoutCell 包含 x, y, width, height 字段且在 0-1 范围内', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        layoutDef.layout.forEach((cell: LayoutCell, cellIndex: number) => {
          expectLayoutCell(cell);
        });
      });
    }
  });

  it('每个布局至少有 1 个单元格', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        expect(layoutDef.layout.length).toBeGreaterThanOrEqual(1);
      });
    }
  });
});

describe('各数量布局数量', () => {
  it('1 张图：1 种布局', () => {
    expect(LAYOUTS[1].length).toBe(1);
  });

  it('2 张图：4 种布局', () => {
    expect(LAYOUTS[2].length).toBe(4);
  });

  it('3 张图：6 种布局', () => {
    expect(LAYOUTS[3].length).toBe(6);
  });

  it('4 张图：6 种布局', () => {
    expect(LAYOUTS[4].length).toBe(6);
  });

  it('5 张图：6 种布局', () => {
    expect(LAYOUTS[5].length).toBe(6);
  });

  it('6 张图：5 种布局', () => {
    expect(LAYOUTS[6].length).toBe(5);
  });

  it('7 张图：2 种布局', () => {
    expect(LAYOUTS[7].length).toBe(2);
  });

  it('8 张图：4 种布局', () => {
    expect(LAYOUTS[8].length).toBe(4);
  });

  it('9 张图：5 种布局', () => {
    expect(LAYOUTS[9].length).toBe(5);
  });
});

describe('布局有效性', () => {
  it('每个布局的单元格总面积大于 0', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        const totalArea = calculateTotalArea(layoutDef.layout);
        expect(totalArea).toBeGreaterThan(0);
      });
    }
  });
});

describe('icon 属性', () => {
  it('icon 是有效的 React 元素（对象形式）', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        expect(layoutDef.icon).toBeDefined();
        expect(typeof layoutDef.icon).toBe('object');
        expect(layoutDef.icon).not.toBeNull();
      });
    }
  });

  it('icon 有 $$typeof 属性（React 元素标识）', () => {
    for (let i = 1; i <= 9; i++) {
      LAYOUTS[i].forEach((layoutDef: LayoutDefinition, index: number) => {
        const icon = layoutDef.icon as any;
        expect(icon.$$typeof).toBeDefined();
      });
    }
  });
});
