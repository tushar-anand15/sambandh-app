/**
 * The map's properties that are not visible in a page test.
 *
 * **Hover cost.** A body can have 100 wards, and hover has to stay cheap. The
 * map is one element per territory, so the browser's own event dispatch does
 * the hit-testing: no point-in-polygon test, no canvas redraw on pointer move.
 * The shapes are memoised on props that do not change when the hovered unit
 * changes, and the outline under the pointer is a CSS rule, so crossing a
 * hundred wards re-renders the one line of text that says what is under the
 * pointer and nothing else. The test below counts that by comparing markup.
 *
 * **Every shape says what a click does**, on hover and on focus, so the map is
 * usable from the keyboard and legible to a screen reader.
 *
 * **The fallback states its cause.** Where the cycle has no published layer the
 * same units are drawn as tiles or as cells, and the map says so in the
 * endpoint's own words rather than leaving a reader to take a square for a
 * boundary. A drawn map says nothing at all: it does not need a caption
 * telling the reader it is a map.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DrillMap from "../DrillMap";
import type { GeoCollection } from "../geometry";
import type { MapUnit } from "../payload";
import type { GeometryState } from "../useElections";

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

/** One square per ward, on a grid, keyed the way the endpoint keys them. */
function wardGeometry(count: number): GeometryState {
  const collection: GeoCollection = {
    type: "FeatureCollection",
    level: "ward",
    cycle: 2025,
    key_property: "ward_no",
    features: Array.from({ length: count }, (_, i) => {
      const x = 76 + (i % 10) * 0.01;
      const y = 10 + Math.floor(i / 10) * 0.01;
      return {
        type: "Feature" as const,
        properties: { ward_no: String(i + 1), ward_name: `Ward ${i + 1}` },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [
            [
              [
                [x, y],
                [x + 0.009, y],
                [x + 0.009, y + 0.009],
                [x, y + 0.009],
                [x, y],
              ],
            ],
          ],
        },
      };
    }),
  };
  return { status: "ready", collection };
}

const NO_LAYER: GeometryState = {
  status: "absent",
  reason: "No ward geometry has been published for the 2020 cycle.",
};

describe("the drawn map", () => {
  it("draws one hit target per ward for a body with 100 wards", () => {
    render(
      <DrillMap
        title="Wards of a large corporation by winning front, 2025"
        units={wards(100)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(100)}
        onSelect={() => {}}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(100);
  });

  it("re-renders nothing but the hover line as the pointer crosses the map", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const units = wards(100);
    const geometry = wardGeometry(100);

    const { rerender } = render(
      <DrillMap
        title="Wards, 2025"
        units={units}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={geometry}
        onSelect={onSelect}
      />,
    );

    const shapes = screen.getAllByRole("button");
    const before = shapes.map((shape) => shape.outerHTML);

    for (const shape of shapes.slice(0, 20)) await user.hover(shape);

    // The shapes are untouched by hovering; only the status line changed.
    expect(screen.getAllByRole("button").map((shape) => shape.outerHTML)).toEqual(before);
    expect(screen.getByTestId("map-hover")).toHaveTextContent(
      "Click for the result in ward 20.",
    );

    // And a re-render with the same units keeps the same nodes.
    const first = screen.getAllByRole("button")[0];
    rerender(
      <DrillMap
        title="Wards, 2025"
        units={units}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={geometry}
        onSelect={onSelect}
      />,
    );
    expect(screen.getAllByRole("button")[0]).toBe(first);
  });

  it("says what a click does when a shape takes focus", async () => {
    const user = userEvent.setup();
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(4)}
        onSelect={() => {}}
      />,
    );

    await user.tab();

    expect(screen.getByTestId("map-hover")).toHaveTextContent(
      "1. Ward 1. Click for the result in ward 1.",
    );
  });

  it("carries the ward's own result in its label, not only in its colour", () => {
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(4)}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "2. Ward 2. Click for the result in ward 2." }),
    ).toBeInTheDocument();
  });

  it("selects the ward a shape stands for", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(4)}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /result in ward 3\./ }));

    expect(onSelect).toHaveBeenCalledWith("3");
  });

  it("says nothing about itself when it is a map", () => {
    // The note that used to sit above every drawn map told the reader the
    // shapes were the real shapes. A map does not need that.
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(4)}
        onSelect={() => {}}
      />,
    );

    expect(screen.queryByText(/not boundaries/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Published boundaries/)).not.toBeInTheDocument();
  });

  it("draws a shape no result covers, without a hit target", () => {
    // One more square than there are wards: the extra one is a shape the
    // results do not reach, and it keeps its place instead of leaving a hole.
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(3)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(4)}
        onSelect={() => {}}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("Ward 4. No result for this cycle.")).toBeInTheDocument();
  });
});

describe("the fallback, where no boundary was published", () => {
  it("draws tiles and states the cause in the endpoint's own words", () => {
    render(
      <DrillMap
        title="Wards of Chalakudy Municipality by winning front, 2020"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={NO_LAYER}
        onSelect={() => {}}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(
      screen.getByText(
        /No ward geometry has been published for the 2020 cycle\./,
      ),
    ).toBeInTheDocument();
    // The cells are named as cells. A grid reads as authoritatively as a
    // coastline, and the reason the endpoint gave is not on its own enough:
    // it says what is missing, not what the shapes on screen are.
    expect(screen.getByText(/Cells, not boundaries/)).toBeInTheDocument();
  });

  it("falls back when the layer holds no polygon for this unit", () => {
    render(
      <DrillMap
        title="Wards of Panoor Grama Panchayat by winning front, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={wardGeometry(0)}
        onSelect={() => {}}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(
      screen.getByText(/No boundaries have been published at this level/),
    ).toBeInTheDocument();
  });

  it("draws the body's own outline around the cells where one was published", () => {
    // 2015 and 2020 publish local body boundaries and no wards at all, so the
    // outline is real and the cells inside it are placeholders.
    const outline: GeoCollection = {
      type: "FeatureCollection",
      level: "local_body",
      cycle: 2020,
      key_property: "lb_code",
      features: [
        {
          type: "Feature",
          properties: { lb_code: "G04036", lb_name: "Amboori" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [76.9, 8.5],
                [77.0, 8.5],
                [77.0, 8.6],
                [76.9, 8.6],
                [76.9, 8.5],
              ],
            ],
          },
        },
      ],
    };

    render(
      <DrillMap
        title="Wards of Amboori Grama Panchayat by winning front, 2020"
        units={wards(13)}
        variant="ward"
        unitNoun="ward"
        cycle={2020}
        geometry={NO_LAYER}
        outline={outline}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("drill-map")).toHaveAttribute("data-outline", "published");
    expect(screen.getAllByRole("button")).toHaveLength(13);
    // No caption here: the outline is a real shape and says so by being one.
    expect(
      screen.queryByText(/wards in number order/),
    ).not.toBeInTheDocument();
    // Not a ward map: the outline is one path, and it was not cut into 13.
    expect(document.querySelectorAll("path")).toHaveLength(1);
  });

  it("draws the cells alone for 2010, which publishes no outline either", () => {
    render(
      <DrillMap
        title="Wards of Amboori Grama Panchayat by winning front, 2010"
        units={wards(13)}
        variant="ward"
        unitNoun="ward"
        cycle={2010}
        geometry={{
          status: "absent",
          reason: "No ward boundaries have been published for the 2010 election.",
        }}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("drill-map")).toHaveAttribute("data-outline", "none");
    expect(screen.getAllByRole("button")).toHaveLength(13);
    expect(screen.getByText(/Cells, not boundaries/)).toBeInTheDocument();
    expect(document.querySelectorAll("path")).toHaveLength(0);
  });

  it("draws nothing while the boundaries are on their way", () => {
    render(
      <DrillMap
        title="Wards, 2025"
        units={wards(4)}
        variant="ward"
        unitNoun="ward"
        cycle={2025}
        geometry={{ status: "loading" }}
        onSelect={() => {}}
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Drawing the map…")).toBeInTheDocument();
  });
});
