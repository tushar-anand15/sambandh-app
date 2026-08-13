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
 * `district_name`, `lb_code` or `ward_no`.
 */
export interface GeoCollection {
  type: "FeatureCollection";
  level: "district" | "local_body" | "ward";
  cycle: number;
  key_property: string;
  features: GeoFeature[];
  provenance?: Record<string, unknown>;
}

export interface Shape {
  /** The unit this outline belongs to: a district name, an lb_code, a ward number. */
  key: string;
  /** The feature's own name, for a shape no result matches. */
  name: string;
  d: string;
}

export interface Projection {
  viewBox: string;
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
    return { viewBox: `0 0 ${WIDTH} ${WIDTH}`, shapes: [] };
  }

  const stretch = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = WIDTH / (spanX * stretch);
  const height = spanY * scale;

  const shapes: Shape[] = [];
  for (const feature of collection.features) {
    const key = feature.properties[collection.key_property];
    if (key === null || key === undefined) continue;

    const parts: string[] = [];
    for (const ring of ringsOf(feature)) {
      if (ring.length < 4) continue;
      const points = ring.map(([x, y]) => {
        const px = ((x - minX) * stretch * scale).toFixed(PLACES);
        const py = ((maxY - y) * scale).toFixed(PLACES);
        return `${px},${py}`;
      });
      parts.push(`M${points.join("L")}Z`);
    }
    if (parts.length === 0) continue;

    shapes.push({ key: String(key), name: nameOf(feature), d: parts.join("") });
  }

  return { viewBox: `0 0 ${WIDTH} ${height.toFixed(PLACES)}`, shapes };
}
