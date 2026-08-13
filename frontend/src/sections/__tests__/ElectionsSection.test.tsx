/**
 * What the Elections page has to hold.
 *
 * Two claims run through most of these cases. The map and the URL are the same
 * thing: every drill-down step is an address, and stepping back out restores
 * the level without dropping the cycle. And one selection has three views —
 * the card at the top, the map, and the candidates beside the ward table — so a
 * click on a row moves all three and none of them replaces another.
 *
 * The rest are about saying what is missing. Mattannur has no published result
 * and must say so with no chart on screen. A body first constituted in 2015
 * reads as not yet constituted in 2010 rather than as having won no seats. A
 * body with no boundary polygon is named, with its reason, instead of quietly
 * missing from the map.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ElectionsSection from "../ElectionsSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";
import { provenance } from "@/test/handlers";
import { server } from "@/test/setup";

// `track` is a no-op unless Umami is configured, so what a test can hold is
// which drills it was called for, not what it sent.
vi.mock("@/lib/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry")>()),
  track: vi.fn(),
}));
const tracked = vi.mocked(track);

/** The address bar, as a testable node. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/elections/:lb?/:cycle?"
          element={
            <>
              <ElectionsSection />
              <Address />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const address = () => screen.getByTestId("address").textContent ?? "";

/** A tile, by the sentence its label ends with. */
const tile = (action: string | RegExp) => screen.getByRole("button", { name: action });

/** The ward table's body rows, once it has rendered. */
async function wardRows() {
  const table = await screen.findByRole("table", { name: /Ward results/ });
  return within(table).getAllByRole("row").slice(1);
}

beforeEach(() => {
  resetBodiesCache();
  tracked.mockClear();
});

describe("the map, three levels deep", () => {
  it("opens a district's local bodies and moves the breadcrumb", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.click(await screen.findByRole("button", { name: /open the .* in THRISSUR/ }));

    expect(address()).toBe("/elections?cycle=2025&district=THRISSUR");
    expect(
      await screen.findByRole("button", { name: /open the wards of Chalakudy/ }),
    ).toBeInTheDocument();

    const crumbs = screen.getByRole("navigation", { name: "Map level" });
    expect(within(crumbs).getByRole("link", { name: "Kerala" })).toBeInTheDocument();
    expect(within(crumbs).getByText("THRISSUR")).toHaveAttribute("aria-current", "page");
  });

  it("opens a body's wards and populates the ward table", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025&district=THRISSUR");

    await user.click(await screen.findByRole("button", { name: /open the wards of Chalakudy/ }));

    expect(address()).toBe("/elections/M08032/2025");
    expect(await wardRows()).toHaveLength(37);
    expect(tile(/result in ward 7\./)).toBeInTheDocument();
  });

  it("fills the card from the map", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    await user.click(await screen.findByRole("button", { name: /result in ward 7\./ }));

    expect(address()).toBe("/elections/M08032/2025?ward=7");
    const panel = screen.getByRole("region", { name: /Result for Ward 7/ });

    // Winner, party, votes, runner-up, margin as a count and a share, reservation.
    expect(within(panel).getByText(/Winner 7 of 2025/)).toBeInTheDocument();
    expect(within(panel).getByText(/INC/)).toBeInTheDocument();
    expect(within(panel).getByText("642")).toBeInTheDocument();
    expect(within(panel).getByText("Runner-up 7")).toBeInTheDocument();
    expect(within(panel).getByText("244")).toBeInTheDocument();
    expect(within(panel).getByText(/21\.0% of 1,160 valid votes/)).toBeInTheDocument();
    expect(within(panel).getByText("SC")).toBeInTheDocument();
  });

  it("selects the same ward from the table as from the map", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    const rows = await wardRows();
    await user.click(rows[6]);

    expect(address()).toBe("/elections/M08032/2025?ward=7");
    expect(tile(/result in ward 7\./)).toHaveAttribute("aria-pressed", "true");
    expect(tile(/result in ward 8\./)).toHaveAttribute("aria-pressed", "false");
    expect((await wardRows())[6]).toHaveAttribute("aria-selected", "true");
  });

  it("names the unit under the pointer and what a click does", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.hover(await screen.findByRole("button", { name: /open the .* in THRISSUR/ }));

    expect(screen.getByTestId("map-hover")).toHaveTextContent(
      /THRISSUR.*Click to open the .* local bodies in THRISSUR\./,
    );
  });
});

describe("what the drill-down reports", () => {
  it("counts a step down the map, and the level it lands on", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.click(await screen.findByRole("button", { name: /open the .* in THRISSUR/ }));
    expect(tracked).toHaveBeenCalledWith({
      name: "map_drill",
      level: "district",
      cycle: 2025,
    });

    await user.click(await screen.findByRole("button", { name: /open the wards of Chalakudy/ }));
    expect(tracked).toHaveBeenLastCalledWith({
      name: "map_drill",
      level: "body",
      cycle: 2025,
    });

    await user.click(await screen.findByRole("button", { name: /result in ward 7\./ }));
    expect(tracked).toHaveBeenLastCalledWith({
      name: "map_drill",
      level: "ward",
      cycle: 2025,
    });
    expect(tracked).toHaveBeenCalledTimes(3);
  });

  it("counts nothing when the breadcrumb walks back out", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    const crumbs = await screen.findByRole("navigation", { name: "Map level" });
    await user.click(within(crumbs).getByRole("link", { name: "THRISSUR" }));

    expect(tracked).not.toHaveBeenCalled();
  });

  it("counts nothing for a hover", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.hover(await screen.findByRole("button", { name: /open the .* in THRISSUR/ }));

    expect(tracked).not.toHaveBeenCalled();
  });
});

describe("the cycle", () => {
  it("re-renders the ward table and the URL when the slider moves", async () => {
    renderAt("/elections/M08032/2020");

    expect(await wardRows()).toHaveLength(36);

    // 2010, 2015, 2020, 2025 — index 3 is 2025.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });

    await waitFor(() => expect(address()).toBe("/elections/M08032/2025"));
    await waitFor(async () => expect(await wardRows()).toHaveLength(37));
  });

  it("keeps the cycle when the breadcrumb walks back to the district", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2020");

    const crumbs = await screen.findByRole("navigation", { name: "Map level" });
    await user.click(within(crumbs).getByRole("link", { name: "THRISSUR" }));

    expect(address()).toBe("/elections?cycle=2020&district=THRISSUR");
    expect(
      await screen.findByRole("button", { name: /open the wards of Chalakudy/ }),
    ).toBeInTheDocument();
  });
});

describe("what is missing, stated", () => {
  it("says the commission published no result for Mattannur, and draws no chart", async () => {
    renderAt("/elections/M13057/2025");

    // The selector states it too, above the section, so both are expected.
    await waitFor(() =>
      expect(screen.getAllByText(/published no result for this body/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Ward results/ })).not.toBeInTheDocument();
  });

  it("reads 2010 as not yet constituted for a body whose first cycle is 2015", async () => {
    // The endpoint answers `no_result_for_cycle` for a cycle before the body
    // existed. What the page owes the reader is that sentence and no chart:
    // zero seats and never constituted are different facts.
    server.use(
      http.get("*/api/elections/M07025/2010", () =>
        HttpResponse.json({
          lb_code: "M07025",
          cycle: 2010,
          body: { lb_name_en: "Aluva", lb_type: "Municipality" },
          in_elections: true,
          first_cycle: 2015,
          last_cycle: 2025,
          available: false,
          reason_code: "no_result_for_cycle",
          reason:
            "This body was not constituted for the 2010 cycle; its results begin in 2015.",
          provenance,
        }),
      ),
    );

    renderAt("/elections/M07025/2010");

    expect(
      await screen.findByText(
        /was not constituted for the 2010 cycle; its results begin in 2015/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Ward results/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("lists a body with no boundary polygon, with its reason", async () => {
    renderAt("/elections?cycle=2025&district=KANNUR");

    expect(
      await screen.findByText(/absent from the map: no boundary layer holds a polygon/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Panoor, Grama Panchayat, no published boundary/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open the wards of Panoor/ }),
    ).not.toBeInTheDocument();
  });
});

describe("one selection, three views", () => {
  it("puts the card above the map, and moves it with the selection", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025?ward=7");

    const card = await screen.findByRole("region", { name: /Result for Ward 7/ });
    const map = screen.getByTestId("drill-map");
    // Above, in reading order: the card is the answer to the click, so it is
    // not below the thing that was clicked.
    expect(card.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click((await wardRows())[7]);

    expect(address()).toBe("/elections/M08032/2025?ward=8");
    expect(
      await screen.findByRole("region", { name: /Result for Ward 8/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Result for Ward 7/ })).not.toBeInTheDocument();
  });

  it("names the body in the card until a ward is chosen", async () => {
    renderAt("/elections/M08032/2025");

    const card = await screen.findByRole("region", { name: /Result for Chalakudy/ });
    expect(within(card).getByText(/UDF majority/)).toBeInTheDocument();
    expect(within(card).getByText("37")).toBeInTheDocument();
  });

  it("lists the candidates beside the ward table rather than in place of it", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    await user.click((await wardRows())[6]);

    // Both tables, at once. Clicking through wards is the point, and it costs
    // nothing if the list of wards stays on screen.
    expect(await wardRows()).toHaveLength(37);
    const candidates = await screen.findByRole("table", { name: /Candidates in Ward 7/ });
    const rows = within(candidates).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("Winner 7 of 2025")).toBeInTheDocument();
    expect(within(rows[0]).getByText("642")).toBeInTheDocument();
    expect(within(rows[0]).getByText("+244")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Runner-up 7")).toBeInTheDocument();
    expect(within(rows[1]).getByText("−244")).toBeInTheDocument();
  });

  it("moves the card, the map and the candidates on a second ward", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025?ward=7");

    await screen.findByRole("table", { name: /Candidates in Ward 7/ });
    const framed = screen.getByTestId("drill-map").getAttribute("viewBox");

    await user.click((await wardRows())[7]);

    expect(address()).toBe("/elections/M08032/2025?ward=8");
    expect(screen.getByRole("region", { name: /Result for Ward 8/ })).toBeInTheDocument();
    expect(
      await screen.findByRole("table", { name: /Candidates in Ward 8/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Candidates in Ward 7/ })).not.toBeInTheDocument();
    expect(tile(/result in ward 8\./)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("drill-map")).toHaveAttribute("data-zoom", "8");
    await waitFor(() =>
      expect(screen.getByTestId("drill-map").getAttribute("viewBox")).not.toBe(framed),
    );
  });

  it("says no ward is selected rather than showing an empty candidates table", async () => {
    renderAt("/elections/M08032/2025");

    const candidates = await screen.findByRole("region", { name: "Candidates" });
    expect(within(candidates).getByText(/No ward is selected/)).toBeInTheDocument();
    expect(within(candidates).queryByRole("table")).not.toBeInTheDocument();
  });

  it("selects a ward from the keyboard", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    const rows = await wardRows();
    rows[2].focus();
    expect(rows[2]).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(address()).toBe("/elections/M08032/2025?ward=3");
  });

  it("moves the map in one step when the reader has asked for no motion", async () => {
    const user = userEvent.setup();
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    try {
      renderAt("/elections/M08032/2025?ward=7");
      await screen.findByRole("region", { name: /Result for Ward 7/ });
      const framed = screen.getByTestId("drill-map").getAttribute("viewBox");

      const frames = vi.spyOn(window, "requestAnimationFrame");
      await user.click((await wardRows())[7]);

      // The new ward is framed, and nothing travelled to get there.
      expect(screen.getByTestId("drill-map").getAttribute("viewBox")).not.toBe(framed);
      expect(frames).not.toHaveBeenCalled();
      frames.mockRestore();
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});

describe("the sources", () => {
  it("lists each layer once, with its size and its file", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });

    expect(within(sources).getByRole("heading", { name: "Sources" })).toBeInTheDocument();
    expect(within(sources).getAllByRole("listitem")).toHaveLength(7);
    // The three cycles that reuse the one November 2020 snapshot, each on its
    // own line with its own size.
    expect(
      within(sources).getAllByText(/local-body polygons, November 2020 snapshot/),
    ).toHaveLength(3);
    expect(within(sources).getByText("56.9 MB")).toBeInTheDocument();
    expect(
      within(sources).getByText(/1,033 of 1,238 local bodies have a polygon/),
    ).toBeInTheDocument();

    // The page-level essay about which cycle was delimited when is the method
    // page's, and is not repeated at the foot of this one.
    expect(
      within(sources).queryByText(/No ward-level geometry exists for 2010, 2015 or 2020/),
    ).not.toBeInTheDocument();
  });

  it("states the ODbL attribution once, not once per layer", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });

    // A licence condition on redistribution, and a rendered map is
    // redistribution. Three layers carry it; the reader is told once.
    expect(within(sources).getAllByText(/© OpenStreetMap contributors/)).toHaveLength(1);
    expect(within(sources).getByText(/ODbL 1\.0/)).toBeInTheDocument();
    expect(
      within(sources).getAllByText(/KSMART publishes no open licence/),
    ).toHaveLength(1);
  });

  it("offers a layer this server holds and states why it cannot offer the other", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });
    expect(within(sources).getAllByRole("link", { name: "Download GeoJSON" })).toHaveLength(6);
    expect(
      within(sources).getByText(/not in the boundary layer directory this server was given/),
    ).toBeInTheDocument();
  });

  it("downloads a layer that parses and carries a non-empty provenance", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });
    const link = within(sources).getAllByRole("link", { name: "Download GeoJSON" })[0];
    const url = link.getAttribute("href") ?? "";
    expect(url).toBe("/geo/wards_2025.geojson");

    const payload = await (await fetch(url)).json();
    expect(payload.type).toBe("FeatureCollection");
    expect(Object.keys(payload.provenance).length).toBeGreaterThan(0);
    expect(payload.provenance.licence).toMatch(/licence/i);
  });
});
