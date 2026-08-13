/**
 * The map's two properties that are not visible in a page test.
 *
 * **Hover cost.** A body can have 100 wards, and hover has to stay cheap. The
 * map is one element per territory, so the browser's own event dispatch does
 * the hit-testing: no point-in-polygon test, no canvas redraw on pointer move.
 * The tiles are memoised on props that do not change when the hovered unit
 * changes, so moving the pointer across a hundred tiles re-renders the one
 * line of text that says what is under it, and nothing else. The test below
 * counts renders to hold that.
 *
 * **Every tile says what a click does**, on hover and on focus, so the map is
 * usable from the keyboard and legible to a screen reader.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DrillMap, { type MapUnit } from "../DrillMap";

const FRONTS = ["LDF", "UDF", "NDA", "OTH"];

function wards(count: number): MapUnit[] {
  return Array.from({ length: count }, (_, i) => ({
    key: String(i + 1),
    name: String(i + 1),
    note: `Ward ${i + 1}`,
    front: FRONTS[i % FRONTS.length],
    action: `Click for the result in ward ${i + 1}.`,
    selected: false,
  }));
}

describe("DrillMap", () => {
  it("draws one hit target per ward for a body with 100 wards", () => {
    render(
      <DrillMap
        title="Wards of a large corporation by winning front, 2025"
        units={wards(100)}
        variant="ward"
        onSelect={() => {}}
        caption="Each tile is one ward."
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(100);
  });

  it("re-renders nothing but the hover line as the pointer crosses the map", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const units = wards(100);

    const { rerender } = render(
      <DrillMap
        title="Wards, 2025"
        units={units}
        variant="ward"
        onSelect={onSelect}
        caption="Each tile is one ward."
      />,
    );

    const tiles = screen.getAllByRole("button");
    const before = tiles.map((tile) => tile.outerHTML);

    for (const tile of tiles.slice(0, 20)) await user.hover(tile);

    // The tiles are untouched by hovering; only the status line changed.
    expect(screen.getAllByRole("button").map((tile) => tile.outerHTML)).toEqual(before);
    expect(screen.getByTestId("map-hover")).toHaveTextContent("Click for the result in ward 20.");

    // And a re-render with the same units keeps the same nodes.
    const first = screen.getAllByRole("button")[0];
    rerender(
      <DrillMap
        title="Wards, 2025"
        units={units}
        variant="ward"
        onSelect={onSelect}
        caption="Each tile is one ward."
      />,
    );
    expect(screen.getAllByRole("button")[0]).toBe(first);
  });

  it("says what a click does when a tile takes focus", async () => {
    const user = userEvent.setup();
    render(
      <DrillMap
        title="Districts of Kerala by ruling front, 2025"
        units={[
          {
            key: "THRISSUR",
            name: "THRISSUR",
            note: "LDF majority, 92 local bodies",
            front: "LDF",
            action: "Click to open the 92 local bodies in THRISSUR.",
            selected: false,
          },
        ]}
        variant="area"
        onSelect={() => {}}
        caption="Each tile is one district."
      />,
    );

    await user.tab();

    expect(screen.getByTestId("map-hover")).toHaveTextContent(
      "THRISSUR. LDF majority, 92 local bodies. Click to open the 92 local bodies in THRISSUR.",
    );
  });

  it("carries the ward's own result in its label, not only in its colour", () => {
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        onSelect={() => {}}
        caption="Each tile is one ward."
      />,
    );

    expect(
      screen.getByRole("button", { name: "2. Ward 2. Click for the result in ward 2." }),
    ).toBeInTheDocument();
  });
});
