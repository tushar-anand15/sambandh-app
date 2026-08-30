/**
 * One tier per request, and never two.
 *
 * A grama panchayat, the block panchayat above it and the district panchayat
 * above that cover the same ground. A map that asked for two of them at once
 * would stack polygons on every point, and the stack would read as one tier
 * summarising another. It does not: each is a separate ballot to a separate
 * body. So each pane has its own address, and that is what these tests hold.
 */

import { describe, expect, it } from "vitest";

import {
  blocksUrl,
  districtsUrl,
  featureFor,
  localBodiesUrl,
  wardsUrl,
} from "../useElections";
import type { GeoCollection } from "../geometry";

describe("the slice each pane asks for", () => {
  it("draws the state from the district outlines", () => {
    expect(districtsUrl(2025)).toBe("/geo/districts/2025.geojson");
  });

  it("draws a district's block panchayats from the block tier alone", () => {
    expect(blocksUrl("THRISSUR", 2025)).toBe("/geo/blocks/THRISSUR.geojson?cycle=2025");
  });

  it("draws a district's grama panchayats from the first tier alone", () => {
    expect(localBodiesUrl("THRISSUR", 2025)).toBe(
      "/geo/local-bodies/THRISSUR.geojson?cycle=2025",
    );
  });

  it("narrows the first tier to one block when a block is open", () => {
    expect(localBodiesUrl("THRISSUR", 2020, "B08076")).toBe(
      "/geo/local-bodies/THRISSUR.geojson?cycle=2020&block=B08076",
    );
  });

  it("asks for nothing where the pane is not open", () => {
    expect(blocksUrl(null, 2025)).toBeNull();
    expect(localBodiesUrl(null, 2025)).toBeNull();
    expect(wardsUrl(null, 2025)).toBeNull();
  });

  it("escapes a district name rather than pasting it into the path", () => {
    expect(blocksUrl("A/B", 2025)).toBe("/geo/blocks/A%2FB.geojson?cycle=2025");
  });

  it("draws a body's own wards, whichever tier the body is", () => {
    expect(wardsUrl("B08076", 2025)).toBe("/geo/wards/B08076.geojson?cycle=2025");
    expect(wardsUrl("G08001", 2015)).toBe("/geo/wards/G08001.geojson?cycle=2015");
  });
});

describe("a body's own outline", () => {
  const collection: GeoCollection = {
    type: "FeatureCollection",
    level: "local_body",
    cycle: 2020,
    key_property: "lb_code",
    features: [
      { type: "Feature", properties: { lb_code: "G08001" }, geometry: null },
      { type: "Feature", properties: { lb_code: "G08002" }, geometry: null },
    ],
  };

  it("is the one feature keyed to that body in a slice already drawn", () => {
    // Never a request of its own: the pre-2025 ward pane draws the outline out
    // of the district slice the pane above it was drawn from.
    const cut = featureFor({ status: "ready", collection }, "G08002");

    expect(cut?.features).toHaveLength(1);
    expect(cut?.features[0].properties.lb_code).toBe("G08002");
  });

  it("is null where the slice holds no polygon for the body", () => {
    expect(featureFor({ status: "ready", collection }, "G13064")).toBeNull();
    expect(featureFor({ status: "loading" }, "G08001")).toBeNull();
  });
});
