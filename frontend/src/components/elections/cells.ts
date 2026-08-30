/**
 * The block of cells that stands in for wards nobody drew.
 *
 * Ward boundaries were published for the 2025 cycle and no cycle before it.
 * The counts differ across a delimitation in 1,136 of 1,199 bodies, so there
 * is no ward-to-ward correspondence between 2025 and 2020 to borrow, and
 * borrowing one anyway would put a reader on ground the ward never covered.
 *
 * What the page draws instead is the body's own outline, which is published,
 * with a compact block of one cell per ward inside it, which is not a claim
 * about anything. The grid's proportions follow the body's bounding box — a
 * long thin panchayat gets 2x7 and a compact one 4x3 — so the block sits in
 * the shape the way the shape lies, and nothing about it invites a reading of
 * which ward is where.
 *
 * The polygon is never subdivided into N parts. That would look like a ward
 * map, and a reader would take the lines for the published divisions. They
 * were never published.
 */

export interface Grid {
  cols: number;
  rows: number;
}

/** How much a wasted cell counts against a grid whose shape fits better. */
const WASTE = 0.06;

/**
 * The grid for `count` cells that lies the way a box of this aspect lies.
 *
 * Aspect is width over height. Every arrangement that holds the cells is
 * scored on how far its own aspect is from the box's, in log space so that
 * 2x7 and 7x2 are equally far from a square, plus a small penalty for cells
 * the count does not fill.
 */
export function gridFor(count: number, aspect: number): Grid {
  const cells = Math.max(1, Math.round(count));
  const wanted = Math.log(aspect > 0 && Number.isFinite(aspect) ? aspect : 1);

  let best: Grid = { cols: cells, rows: 1 };
  let score = Infinity;

  for (let cols = 1; cols <= cells; cols += 1) {
    const rows = Math.ceil(cells / cols);
    const candidate =
      Math.abs(Math.log(cols / rows) - wanted) + WASTE * (cols * rows - cells);
    if (candidate < score) {
      score = candidate;
      best = { cols, rows };
    }
  }

  return best;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellBlock extends Grid {
  /** One cell's side, in the same units as the box. */
  size: number;
  /** The block's top-left corner. */
  x: number;
  y: number;
}

/**
 * Where the block sits and how big its cells are.
 *
 * Centred on the point given — the pole of inaccessibility, where a body has
 * one, so the block lands in the widest part of a crescent-shaped panchayat
 * rather than across its bay. The cell size comes from the largest circle that
 * fits inside the shape at that point, then is held between 40% and 70% of
 * what the bounding box alone would allow: without the floor a body whose
 * inscribed circle is thin gets cells too small to carry a number, and without
 * the ceiling a round one gets a block that fills the outline and reads as a
 * division of it.
 */
export function blockIn(
  count: number,
  box: Box,
  centre: { x: number; y: number; r: number },
): CellBlock {
  const grid = gridFor(count, box.h > 0 ? box.w / box.h : 1);
  const room = Math.min(box.w / grid.cols, box.h / grid.rows);
  const fromCircle = (2 * centre.r * 0.95) / Math.hypot(grid.cols, grid.rows);
  const size = Math.min(Math.max(fromCircle, room * 0.4), room * 0.7);

  const width = grid.cols * size;
  const height = grid.rows * size;

  return {
    ...grid,
    size,
    x: Math.min(Math.max(centre.x - width / 2, box.x), box.x + box.w - width),
    y: Math.min(Math.max(centre.y - height / 2, box.y), box.y + box.h - height),
  };
}
