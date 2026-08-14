import { describe, it, expect } from 'vitest';
import { LAYOUTS, type LayoutCell } from './CollageVariants';

const EPS = 1e-9;

function cellArea(c: LayoutCell) {
  return c.width * c.height;
}

describe('LAYOUTS', () => {
  it('provides layouts for every supported image count 1..9', () => {
    expect(
      Object.keys(LAYOUTS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('each layout has a number of cells matching its image count (no silent image drop)', () => {
    for (const countStr of Object.keys(LAYOUTS)) {
      const count = Number(countStr);
      for (const [index, def] of LAYOUTS[count].entries()) {
        expect(def.layout.length, `count=${count} layout=${index}`).toBe(count);
      }
    }
  });

  it('every layout offers at least one variant', () => {
    for (const countStr of Object.keys(LAYOUTS)) {
      expect(LAYOUTS[Number(countStr)].length, `count=${countStr}`).toBeGreaterThan(0);
    }
  });

  it('every cell stays within the unit square and has positive size', () => {
    for (const countStr of Object.keys(LAYOUTS)) {
      const count = Number(countStr);
      for (const [lIdx, def] of LAYOUTS[count].entries()) {
        for (const [cIdx, cell] of def.layout.entries()) {
          expect(cell.x, `count=${count} layout=${lIdx} cell=${cIdx} x`).toBeGreaterThanOrEqual(0);
          expect(cell.y, `count=${count} layout=${lIdx} cell=${cIdx} y`).toBeGreaterThanOrEqual(0);
          expect(cell.width, `count=${count} layout=${lIdx} cell=${cIdx} width`).toBeGreaterThan(0);
          expect(cell.height, `count=${count} layout=${lIdx} cell=${cIdx} height`).toBeGreaterThan(0);
          expect(cell.x + cell.width, `count=${count} layout=${lIdx} cell=${cIdx} x+width`).toBeLessThanOrEqual(
            1 + EPS,
          );
          expect(cell.y + cell.height, `count=${count} layout=${lIdx} cell=${cIdx} y+height`).toBeLessThanOrEqual(
            1 + EPS,
          );
        }
      }
    }
  });

  it('every layout tiles the unit square without gaps or overlaps', () => {
    for (const countStr of Object.keys(LAYOUTS)) {
      const count = Number(countStr);
      for (const [lIdx, def] of LAYOUTS[count].entries()) {
        const cells = def.layout;
        // total area must equal the unit square
        const totalArea = cells.reduce((sum, c) => sum + cellArea(c), 0);
        expect(totalArea, `count=${count} layout=${lIdx} total area`).toBeCloseTo(1, 9);
        // pairwise: cells must not overlap
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i];
            const b = cells[j];
            const overlapX = a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS;
            const overlapY = a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS;
            expect(overlapX && overlapY, `count=${count} layout=${lIdx}: cells ${i} and ${j} overlap`).toBe(false);
          }
        }
      }
    }
  });

  it('every layout defines a corresponding icon', () => {
    for (const countStr of Object.keys(LAYOUTS)) {
      for (const def of LAYOUTS[Number(countStr)]) {
        expect(def.icon).toBeDefined();
      }
    }
  });
});
