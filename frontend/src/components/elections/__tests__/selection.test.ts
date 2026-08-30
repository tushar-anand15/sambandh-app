/**
 * The URL is the selection. Nothing on this page holds a level in state.
 *
 * The page stacks the levels rather than replacing one with the next, so an
 * address does not name a pane — it names the deepest pane, and every pane
 * above it is open too. These tests pin the round trip both ways, because a
 * page that could write an address it cannot read would break the back button
 * and every shared link with it.
 */

import { describe, expect, it } from "vitest";

import { electionsPath, paneKey, readSelection } from "../selection";

const read = (search: string, params: { lb?: string; cycle?: string } = {}) =>
  readSelection(params, new URLSearchParams(search), null);

describe("reading an address", () => {
  it("opens a district on all three of its tiers at once", () => {
    const selection = read("cycle=2025&district=THRISSUR");

    expect(selection.level).toBe("district");
    expect(selection.district).toBe("THRISSUR");
    expect(selection.block).toBeNull();
  });

  it("reads an open block panchayat as its own level", () => {
    const selection = read("cycle=2025&district=THRISSUR&block=B08076");

    expect(selection.level).toBe("block");
    expect(selection.block).toBe("B08076");
    expect(selection.district).toBe("THRISSUR");
  });

  it("keeps the block a body was reached through", () => {
    // The block's pane stays open above the body's, so going back to the
    // other grama panchayats in that block is a scroll and not a back-click.
    const selection = read("block=B08076", { lb: "G08001", cycle: "2025" });

    expect(selection.level).toBe("body");
    expect(selection.block).toBe("B08076");
  });

  it("opens a body on its own where no block was passed through", () => {
    expect(read("", { lb: "G08001", cycle: "2025" }).block).toBeNull();
  });

  it("reads a ward as the deepest level of a body", () => {
    const selection = read("ward=7", { lb: "G08001", cycle: "2025" });

    expect(selection.level).toBe("ward");
    expect(selection.ward).toBe(7);
  });

  it("keeps the cycle the reader picked at every level", () => {
    expect(read("cycle=2015&district=THRISSUR&block=B08076").cycle).toBe(2015);
    expect(read("", { lb: "G08001", cycle: "2015" }).cycle).toBe(2015);
  });

  it("falls back to the latest cycle rather than a year with no election", () => {
    expect(read("cycle=2023").cycle).toBe(2025);
  });
});

describe("writing an address", () => {
  it("writes a district with nothing else in it", () => {
    // The tier used to be here, choosing between a district's block panchayats
    // and its grama panchayats. Both are drawn now, one pane under the other.
    expect(electionsPath({ cycle: 2025, district: "THRISSUR" })).toBe(
      "/elections?cycle=2025&district=THRISSUR",
    );
  });

  it("carries the block into a body address, and the ward after it", () => {
    expect(
      electionsPath({ cycle: 2025, lbCode: "G08001", block: "B08076", ward: 7 }),
    ).toBe("/elections/G08001/2025?block=B08076&ward=7");
    expect(electionsPath({ cycle: 2025, lbCode: "G08001" })).toBe(
      "/elections/G08001/2025",
    );
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
      { cycle: 2015, district: "THRISSUR", block: "B08076" },
    ];

    for (const next of cases) {
      const search = electionsPath(next).split("?")[1] ?? "";
      const back = read(search);
      expect(back.cycle).toBe(next.cycle);
      expect(back.district).toBe(next.district ?? null);
      expect(back.block).toBe(next.block ?? null);
    }
  });
});

describe("which chapter a selection rests in", () => {
  it("holds still while the reader moves between wards of one body", () => {
    // Ward 7 to ward 8 is not a new chapter, so the page does not scroll.
    const seven = read("ward=7", { lb: "G08001", cycle: "2025" });
    const eight = read("ward=8", { lb: "G08001", cycle: "2025" });

    expect(paneKey(seven)).toBe(paneKey(eight));
  });

  it("ignores the cycle, which re-colours the panes and moves nobody", () => {
    expect(paneKey(read("cycle=2020&district=THRISSUR"))).toBe(
      paneKey(read("cycle=2010&district=THRISSUR")),
    );
  });

  it("changes when a selection opens a level that was not open", () => {
    expect(paneKey(read("cycle=2025&district=THRISSUR"))).not.toBe(
      paneKey(read("cycle=2025&district=THRISSUR&block=B08076")),
    );
    expect(paneKey(read("", { lb: "G08001", cycle: "2025" }))).not.toBe(
      paneKey(read("ward=7", { lb: "G08001", cycle: "2025" })),
    );
  });
});
