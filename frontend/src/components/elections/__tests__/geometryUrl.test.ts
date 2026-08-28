/**
 * One tier per request, and never two.
 *
 * A grama panchayat, the block panchayat above it and the district panchayat
 * above that cover the same ground. A map that asked for two of them at once
 * would stack polygons on every point, and the stack would read as one tier
 * summarising another. It does not: each is a separate ballot to a separate
 * body. So the addresses below are mutually exclusive by construction, and
 * that is what these tests hold.
 */

import { describe, expect, it } from "vitest";

import { geometryUrl } from "../useElections";

describe("the slice each level asks for", () => {
  it("draws the state from the district outlines", () => {
    expect(geometryUrl("state", 2025, null, null)).toBe("/geo/districts/2025.geojson");
  });

  it("draws a district's block panchayats from the block tier alone", () => {
    expect(
      geometryUrl("district", 2025, "THRISSUR", null, "block_panchayat"),
    ).toBe("/geo/blocks/THRISSUR.geojson?cycle=2025");
  });

  it("draws a district's grama panchayats from the first tier alone", () => {
    expect(
      geometryUrl("district", 2025, "THRISSUR", null, "grama_panchayat"),
    ).toBe("/geo/local-bodies/THRISSUR.geojson?cycle=2025");
  });

  it("narrows the first tier to one block when a block is open", () => {
    expect(
      geometryUrl("block", 2020, "THRISSUR", null, "block_panchayat", "B08076"),
    ).toBe("/geo/local-bodies/THRISSUR.geojson?cycle=2020&block=B08076");
  });

  it("asks for nothing where the level has nothing to draw yet", () => {
    expect(geometryUrl("district", 2025, null, null)).toBeNull();
    expect(geometryUrl("block", 2025, "THRISSUR", null, "block_panchayat", null)).toBeNull();
    expect(geometryUrl("body", 2025, null, null)).toBeNull();
  });

  it("escapes a district name rather than pasting it into the path", () => {
    expect(geometryUrl("district", 2025, "A/B", null, "block_panchayat")).toBe(
      "/geo/blocks/A%2FB.geojson?cycle=2025",
    );
  });

  it("draws a body's own wards, whichever tier the body is", () => {
    expect(geometryUrl("body", 2025, "THRISSUR", "B08076")).toBe(
      "/geo/wards/B08076.geojson?cycle=2025",
    );
    expect(geometryUrl("ward", 2025, "THRISSUR", "G08001")).toBe(
      "/geo/wards/G08001.geojson?cycle=2025",
    );
  });
});
