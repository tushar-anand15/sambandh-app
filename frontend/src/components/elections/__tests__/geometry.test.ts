/**
 * The projection, which is where a map goes wrong silently.
 *
 * Three things it has to get right: north is up, longitude is narrowed by the
 * cosine of the latitude so the state is not drawn 2% too wide, and every
 * shape lands under the key the endpoint said would match it. A shape drawn
 * upside down is obvious; a shape drawn under the wrong key looks fine and
 * colours the wrong territory.
 */

import { describe, expect, it } from "vitest";

import { project, type GeoCollection } from "../geometry";

function collection(features: GeoCollection["features"]): GeoCollection {
  return {
    type: "FeatureCollection",
    level: "local_body",
    cycle: 2025,
    key_property: "lb_code",
    features,
  };
}

/** A unit square, in degrees, at Kerala's latitude. */
function square(lb_code: string, x: number, y: number): GeoCollection["features"][0] {
  return {
    type: "Feature",
    properties: { lb_code, lb_name: `Body ${lb_code}` },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
          [x, y],
        ],
      ],
    },
  };
}

describe("project", () => {
  it("puts north at the top of a 1,000-unit viewBox", () => {
    const { viewBox, shapes } = project(collection([square("G01", 76, 10)]));

    // One degree of longitude at 10.5°N is cos(10.5) of a degree of latitude,
    // so a square degree is drawn taller than it is wide.
    expect(viewBox).toBe("0 0 1000 1017.0");
    // The first point is the square's south-west corner, which is bottom left.
    expect(shapes[0].d.startsWith("M0.0,1017.0")).toBe(true);
  });

  it("gives every feature the key its properties carry", () => {
    const { shapes } = project(
      collection([square("G01", 76, 10), square("G02", 77, 10)]),
    );

    expect(shapes.map((shape) => shape.key)).toEqual(["G01", "G02"]);
    expect(shapes.map((shape) => shape.name)).toEqual(["Body G01", "Body G02"]);
    // Two squares side by side: the second one starts where the first ended.
    expect(shapes[1].d.startsWith("M500.0")).toBe(true);
  });

  it("reads a MultiPolygon's parts as one shape", () => {
    const feature = square("G01", 76, 10);
    const island = square("G01", 77, 10);
    const multi: GeoCollection["features"][0] = {
      ...feature,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          feature.geometry!.coordinates as number[][][],
          island.geometry!.coordinates as number[][][],
        ],
      },
    };

    const { shapes } = project(collection([multi]));

    expect(shapes).toHaveLength(1);
    expect(shapes[0].d.match(/M/g)).toHaveLength(2);
  });

  it("draws nothing for a collection with no features", () => {
    expect(project(collection([])).shapes).toEqual([]);
  });

  it("skips a feature whose key property is absent", () => {
    const nameless = square("G01", 76, 10);
    nameless.properties = { lb_name: "Unkeyed" };

    expect(project(collection([nameless, square("G02", 77, 10)])).shapes).toHaveLength(1);
  });
});
