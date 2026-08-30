/**
 * The block of cells that stands in for wards nobody drew.
 *
 * The one thing it must never do is look like a ward map. So the grid follows
 * the body's own proportions — which is a fact about the body, not a claim
 * about a ward — and the block sits inside the outline rather than being cut
 * out of it.
 */

import { describe, expect, it } from "vitest";

import { blockIn, gridFor } from "../cells";

describe("the grid the cells sit on", () => {
  it("lies the way a long thin body lies", () => {
    expect(gridFor(14, 0.29)).toEqual({ cols: 2, rows: 7 });
  });

  it("lies the way a wide body lies", () => {
    expect(gridFor(14, 3.5)).toEqual({ cols: 7, rows: 2 });
  });

  it("is square-ish for a compact body", () => {
    expect(gridFor(12, 1.33)).toEqual({ cols: 4, rows: 3 });
    expect(gridFor(13, 1)).toEqual({ cols: 4, rows: 4 });
  });

  it("holds every ward, including the counts that fill no rectangle", () => {
    for (let count = 1; count <= 100; count += 1) {
      const grid = gridFor(count, 1.2);
      expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(count);
    }
  });
});

describe("where the block sits", () => {
  const box = { x: 0, y: 0, w: 1000, h: 800 };

  it("stays inside the body's own bounding box", () => {
    // A body whose widest point is near an edge still gets its whole block
    // drawn inside the shape's box rather than half of it outside.
    const block = blockIn(13, box, { x: 60, y: 750, r: 200 });

    expect(block.x).toBeGreaterThanOrEqual(box.x);
    expect(block.y).toBeGreaterThanOrEqual(box.y);
    expect(block.x + block.cols * block.size).toBeLessThanOrEqual(box.x + box.w + 0.001);
    expect(block.y + block.rows * block.size).toBeLessThanOrEqual(box.y + box.h + 0.001);
  });

  it("keeps a cell big enough to carry its number in a thin body", () => {
    // The inscribed circle of a crescent-shaped coastal panchayat is small.
    // Sizing from it alone would leave cells too small to read.
    const thin = blockIn(13, box, { x: 500, y: 400, r: 5 });

    expect(thin.size).toBeGreaterThan(0);
    expect(thin.size).toBeGreaterThanOrEqual(
      Math.min(box.w / thin.cols, box.h / thin.rows) * 0.4 - 0.001,
    );
  });
});
