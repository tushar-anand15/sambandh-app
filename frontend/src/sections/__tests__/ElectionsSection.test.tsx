/**
 * What the Elections page has to hold.
 *
 * Two claims run through most of these cases. The map and the URL are the same
 * thing: every drill-down step is an address, and stepping back out restores
 * the level without dropping the cycle. And the map and the ward table are one
 * selection, not two, so a row click and a tile click land on the same ward.
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
import { beforeEach, describe, expect, it } from "vitest";

import ElectionsSection from "../ElectionsSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { provenance } from "@/test/handlers";
import { server } from "@/test/setup";

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

  it("fills the result panel from a ward tile", async () => {
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

describe("the boundary layers", () => {
  it("states the ward-geometry gap and the reused snapshot", async () => {
    renderAt("/elections?cycle=2025");

    const layers = await screen.findByRole("region", { name: "Boundary layers" });
    expect(
      within(layers).getByText(/No ward-level geometry exists for 2010, 2015 or 2020/),
    ).toBeInTheDocument();
    expect(
      within(layers).getByText(
        /single opendatakerala snapshot taken in November\s+2020, reused for all three cycles/,
      ),
    ).toBeInTheDocument();
    expect(within(layers).getByText(/7 layers: four from KSMART/)).toBeInTheDocument();
  });

  it("offers a layer this server holds and states why it cannot offer the other", async () => {
    renderAt("/elections?cycle=2025");

    const layers = await screen.findByRole("region", { name: "Boundary layers" });
    expect(within(layers).getAllByRole("link", { name: "Download GeoJSON" })).toHaveLength(6);
    expect(
      within(layers).getByText(/not in the boundary layer directory this server was given/),
    ).toBeInTheDocument();
  });

  it("downloads a layer that parses and carries a non-empty provenance", async () => {
    renderAt("/elections?cycle=2025");

    const layers = await screen.findByRole("region", { name: "Boundary layers" });
    const link = within(layers).getAllByRole("link", { name: "Download GeoJSON" })[0];
    const url = link.getAttribute("href") ?? "";
    expect(url).toBe("/geo/wards_2025.geojson");

    const payload = await (await fetch(url)).json();
    expect(payload.type).toBe("FeatureCollection");
    expect(Object.keys(payload.provenance).length).toBeGreaterThan(0);
    expect(payload.provenance.licence).toMatch(/licence/i);
  });
});
