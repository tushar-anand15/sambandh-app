/**
 * The GeoJSON the map draws, and the projection that turns it into SVG paths.
 *
 * The backend cuts one level of one cycle out of the published layer and sends
 * it here — about 48 kB for a body's wards, 240 kB for a district's local
 * bodies, 130 kB for the fourteen district outlines. Every coordinate arrives
 * already simplified for the width it is drawn at, so nothing is thinned again
 * in the browser.
 *
 * The projection is equirectangular with longitude scaled by the cosine of the
 * mean latitude, which is what keeps Kerala from looking 2% too wide. At this
 * extent — one state, one district, one panchayat — the difference between that
 * and Web Mercator is under a pixel, and this needs no tiles, no library and no
 * second coordinate system to reason about.
 *
 * Each feature becomes one `d` string, built once and memoised. Hit-testing is
 * then the browser's own: a pointer over a `<path>` fires that path's handler,
 * so a hundred wards cost a hundred elements and no point-in-polygon test.
 *
 * Every shape also carries the point its name is written at and the radius of
 * the largest circle that fits inside it at that point. The centroid is the
 * wrong point here: a crescent-shaped coastal panchayat has its centroid in the
 * sea, and Kerala has many of those. `labelPoint` is the pole of
 * inaccessibility instead, found by a grid search that refines around its own
 * best cell, and the radius it returns is what tells the caller whether a name
 * fits inside the shape or has to be dropped.
 */

/** A ring: the closed outline of one polygon. */
type Ring = number[][];

export interface GeoFeature {
  type: "Feature";
  properties: Record<string, string | number | null>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: Ring[] | Ring[][];
  } | null;
}

/**
 * What `/geo/districts/{cycle}.geojson` and its two siblings return.
 * `key_property` names the property that matches a feature to a map unit:
 * `district_name`, `lb_code` or `ward_no`. `level` names the tier: the three
 * rural tiers are separate levels because they are separate elections, and no
 * slice ever mixes two of them.
 */
export interface GeoCollection {
  type: "FeatureCollection";
  level: "district" | "district_panchayat" | "block_panchayat" | "local_body" | "ward";
  cycle: number;
  key_property: string;
  features: GeoFeature[];
  provenance?: Record<string, unknown>;
}

/** A rectangle in viewBox units. The map's extent, and every shape's own. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Shape {
  /** The unit this outline belongs to: a district name, an lb_code, a ward number. */
  key: string;
  /** The feature's own name, for a shape no result matches. */
  name: string;
  d: string;
  /** The shape's own extent, which is what the map zooms to. */
  box: Box;
  /** Where the name is written: the pole of inaccessibility. */
  labelX: number;
  labelY: number;
  /** The largest circle that fits inside the shape at that point. */
  labelRadius: number;
}

export interface Projection {
  viewBox: string;
  /** Everything drawn, as one rectangle. The unzoomed view. */
  extent: Box;
  shapes: Shape[];
}

/** The viewBox is this many units wide; height follows the extent. */
const WIDTH = 1000;

/** One decimal of a 1,000-unit viewBox is a tenth of a pixel at any width. */
const PLACES = 1;

const NAME_PROPERTIES = ["ward_name", "lb_name", "district_name"];

function ringsOf(feature: GeoFeature): Ring[] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Ring[][]).flat();
  }
  return geometry.coordinates as Ring[];
}

function nameOf(feature: GeoFeature): string {
  for (const property of NAME_PROPERTIES) {
    const value = feature.properties[property];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Where a name goes
// ---------------------------------------------------------------------------

/** A ring already in viewBox units. */
type Flat = number[][];

function boxOf(rings: Flat[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * How far a point is from the shape's edge, negative outside it.
 *
 * Distance is to the nearest segment of any ring; the sign comes from an
 * even-odd crossing test over all of them, so a hole counts as outside.
 */
function edgeDistance(px: number, py: number, rings: Flat[]): number {
  let inside = false;
  let nearest = Infinity;

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];

      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
        inside = !inside;
      }

      let dx = bx - ax;
      let dy = by - ay;
      const length = dx * dx + dy * dy;
      let t = 0;
      if (length > 0) {
        t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
      }
      dx = ax + t * dx - px;
      dy = ay + t * dy - py;
      const distance = dx * dx + dy * dy;
      if (distance < nearest) nearest = distance;
    }
  }

  return (inside ? 1 : -1) * Math.sqrt(nearest);
}

/** The coarse grid, and the rounds that refine around its best cell. */
const GRID = 10;
const REFINEMENTS = 4;

/**
 * The point inside the shape furthest from any edge, and that distance.
 *
 * A grid over the bounding box, then four rounds that halve the step and look
 * at the eight cells around the best point found so far. About 170 distance
 * tests per shape, which for a hundred wards runs once and is memoised.
 */
function labelPoint(rings: Flat[], box: Box): { x: number; y: number; r: number } {
  let bestX = box.x + box.w / 2;
  let bestY = box.y + box.h / 2;
  let best = edgeDistance(bestX, bestY, rings);

  let stepX = box.w / GRID;
  let stepY = box.h / GRID;
  for (let i = 0; i <= GRID; i += 1) {
    for (let j = 0; j <= GRID; j += 1) {
      const x = box.x + i * stepX;
      const y = box.y + j * stepY;
      const distance = edgeDistance(x, y, rings);
      if (distance > best) {
        best = distance;
        bestX = x;
        bestY = y;
      }
    }
  }

  for (let round = 0; round < REFINEMENTS; round += 1) {
    stepX /= 2;
    stepY /= 2;
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        if (i === 0 && j === 0) continue;
        const x = bestX + i * stepX;
        const y = bestY + j * stepY;
        const distance = edgeDistance(x, y, rings);
        if (distance > best) {
          best = distance;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  return { x: bestX, y: bestY, r: Math.max(0, best) };
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

/** How much of the framed shape's own size is left as margin around it. */
const FRAME_PADDING = 0.9;

/** No selection is ever blown up past this share of the whole map, so a ward
 *  is always read with its neighbours around it. */
const CLOSEST = 0.45;

/**
 * The viewBox that frames one shape, in the extent's own proportions.
 *
 * A null box gives the whole extent back, which is what the map shows when
 * nothing is selected. The framed box is padded, held to the map's aspect
 * ratio, stopped from zooming closer than `CLOSEST`, and pushed back inside
 * the extent so a selection at the edge does not pan off it.
 */
export function frame(extent: Box, box: Box | null): Box {
  if (!box || extent.w <= 0 || extent.h <= 0) return extent;

  const aspect = extent.w / extent.h;
  let w = Math.max(box.w * (1 + FRAME_PADDING), box.h * (1 + FRAME_PADDING) * aspect);
  w = Math.min(Math.max(w, extent.w * CLOSEST), extent.w);
  let h = w / aspect;
  if (h > extent.h) {
    h = extent.h;
    w = h * aspect;
  }

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: Math.min(Math.max(cx - w / 2, extent.x), extent.x + extent.w - w),
    y: Math.min(Math.max(cy - h / 2, extent.y), extent.y + extent.h - h),
    w,
    h,
  };
}

/** A box as the `viewBox` attribute, at the projection's own precision. */
export function viewBoxOf(box: Box): string {
  return [box.x, box.y, box.w, box.h].map((n) => n.toFixed(PLACES)).join(" ");
}

/**
 * Project every feature to one SVG path, and give the viewBox they share.
 *
 * Returns no shapes when the collection is empty or its extent has no width,
 * which is what the caller reads as "there is nothing to draw here".
 */
export function project(collection: GeoCollection): Projection {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of collection.features) {
    for (const ring of ringsOf(feature)) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!Number.isFinite(spanX) || spanX <= 0 || spanY <= 0) {
    const empty = { x: 0, y: 0, w: WIDTH, h: WIDTH };
    return { viewBox: `0 0 ${WIDTH} ${WIDTH}`, extent: empty, shapes: [] };
  }

  const stretch = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = WIDTH / (spanX * stretch);
  const height = spanY * scale;
  const extent = { x: 0, y: 0, w: WIDTH, h: Number(height.toFixed(PLACES)) };

  const shapes: Shape[] = [];
  for (const feature of collection.features) {
    const key = feature.properties[collection.key_property];
    if (key === null || key === undefined) continue;

    const parts: string[] = [];
    const flat: Flat[] = [];
    for (const ring of ringsOf(feature)) {
      if (ring.length < 4) continue;
      const projected = ring.map(([x, y]) => [
        Number(((x - minX) * stretch * scale).toFixed(PLACES)),
        Number(((maxY - y) * scale).toFixed(PLACES)),
      ]);
      flat.push(projected);
      parts.push(`M${projected.map(([x, y]) => `${x.toFixed(PLACES)},${y.toFixed(PLACES)}`).join("L")}Z`);
    }
    if (parts.length === 0) continue;

    const box = boxOf(flat);
    const pole = labelPoint(flat, box);
    shapes.push({
      key: String(key),
      name: nameOf(feature),
      d: parts.join(""),
      box,
      labelX: pole.x,
      labelY: pole.y,
      labelRadius: pole.r,
    });
  }

  return { viewBox: `0 0 ${WIDTH} ${height.toFixed(PLACES)}`, extent, shapes };
}
