/**
 * The URL is the selection. Nothing on this page holds a level in state.
 *
 * A district is three elections over one piece of ground, so which of them is
 * on screen has to be in the address like everything else: a link to "the
 * block panchayats of Thrissur" and a link to "the grama panchayats of
 * Thrissur" are different views of the same district and must be different
 * addresses. These tests pin the round trip both ways — what an address reads
 * as, and what a selection is written back to — because a page that could
 * write an address it cannot read would break the back button and every shared
 * link with it.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIER,
  electionsPath,
  readSelection,
  type Tier,
} from "../selection";

const read = (search: string, params: { lb?: string; cycle?: string } = {}) =>
  readSelection(params, new URLSearchParams(search), null);

describe("reading an address", () => {
  it("opens a district on the block panchayats", () => {
    const selection = read("cycle=2025&district=THRISSUR");

    expect(selection.level).toBe("district");
    expect(selection.tier).toBe("block_panchayat");
    expect(selection.block).toBeNull();
  });

  it("carries the tier a reader chose", () => {
    expect(read("cycle=2025&district=THRISSUR&tier=grama_panchayat").tier).toBe(
      "grama_panchayat",
    );
  });

  it("falls back to the default tier rather than a level it cannot draw", () => {
    // A hand-edited or stale address must not leave the page asking for a tier
    // no endpoint answers.
    expect(read("cycle=2025&district=THRISSUR&tier=panchayat_union").tier).toBe(
      DEFAULT_TIER,
    );
  });

  it("reads an open block panchayat as its own level", () => {
    const selection = read("cycle=2025&district=THRISSUR&block=B08076");

    expect(selection.level).toBe("block");
    expect(selection.block).toBe("B08076");
    expect(selection.district).toBe("THRISSUR");
  });

  it("ignores a block once a body is open", () => {
    // A body's wards are its own. Carrying a block through would put a crumb
    // on screen that no longer describes where the reader is.
    const selection = read("block=B08076", { lb: "G08001", cycle: "2025" });

    expect(selection.level).toBe("body");
    expect(selection.block).toBeNull();
  });

  it("keeps the cycle the reader picked at every level", () => {
    expect(read("cycle=2015&district=THRISSUR&block=B08076").cycle).toBe(2015);
    expect(read("", { lb: "G08001", cycle: "2015" }).cycle).toBe(2015);
  });
});

describe("writing an address", () => {
  it("leaves the default tier out, so the plainest view has the plainest link", () => {
    expect(electionsPath({ cycle: 2025, district: "THRISSUR" })).toBe(
      "/elections?cycle=2025&district=THRISSUR",
    );
    expect(
      electionsPath({ cycle: 2025, district: "THRISSUR", tier: DEFAULT_TIER }),
    ).toBe("/elections?cycle=2025&district=THRISSUR");
  });

  it("writes a chosen tier", () => {
    expect(
      electionsPath({
        cycle: 2025,
        district: "THRISSUR",
        tier: "grama_panchayat" as Tier,
      }),
    ).toBe("/elections?cycle=2025&district=THRISSUR&tier=grama_panchayat");
  });

  it("keeps the district beside an open block", () => {
    // The block's grama panchayats are cut out of the district's slice, so the
    // address has to carry enough to ask for them without a lookup.
    expect(
      electionsPath({ cycle: 2025, district: "THRISSUR", block: "B08076" }),
    ).toBe("/elections?cycle=2025&district=THRISSUR&block=B08076");
  });

  it("round-trips every level it can write", () => {
    const cases = [
      { cycle: 2025 },
      { cycle: 2025, district: "THRISSUR" },
      { cycle: 2025, district: "THRISSUR", tier: "grama_panchayat" as Tier },
      { cycle: 2015, district: "THRISSUR", block: "B08076" },
    ];

    for (const next of cases) {
      const search = electionsPath(next).split("?")[1] ?? "";
      const back = read(search);
      expect(back.cycle).toBe(next.cycle);
      expect(back.district).toBe(next.district ?? null);
      expect(back.block).toBe(next.block ?? null);
      expect(back.tier).toBe(next.tier ?? DEFAULT_TIER);
    }
  });
});
