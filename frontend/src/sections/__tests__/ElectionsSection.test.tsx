/**
 * What the Elections page has to hold.
 *
 * Three claims run through most of these cases.
 *
 * **The page is chapters that stack.** A selection appends a pane below the
 * one it was made in and leaves every pane above it on screen and live, so a
 * reader who has drilled four levels down can still click the second one
 * without going back for it.
 *
 * **The map and the URL are the same thing.** Every step is an address, and
 * stepping back out restores the level without dropping the cycle.
 *
 * **A ward never crosses a delimitation.** 1,136 of 1,199 bodies change ward
 * count between cycles, so moving the cycle closes the ward pane. Where the
 * cycle takes the body itself, the drill rests at the deepest pane that
 * survived and that pane says which body went.
 *
 * The rest are about saying what is missing. Mattannur has no published result
 * and must say so with no chart on screen. A body with no boundary polygon is
 * named, with its reason, instead of quietly missing from the map.
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

/** A shape or a tile, by the sentence its label ends with. */
const tile = (action: string | RegExp) => screen.getByRole("button", { name: action });

/** The ward table's body rows, once it has rendered. */
async function wardRows() {
  const table = await screen.findByRole("table", { name: /Ward results/ });
  return within(table).getAllByRole("row").slice(1);
}

/** One pane, by its own heading. */
const pane = (name: RegExp) => screen.getByRole("region", { name });

beforeEach(() => {
  resetBodiesCache();
  tracked.mockClear();
});

describe("the map, first on the page", () => {
  it("puts nothing above the map but the cycle control", async () => {
    renderAt("/elections?cycle=2025");
    await screen.findByTestId("drill-map");

    // The lede that used to open the page explained the tiers the panes now
    // show, and used the negative parallelism the style guide bans.
    expect(screen.queryByText(/never a summary of the tier below/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Published boundaries/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/coloured by the front that runs the district panchayat\. The/),
    ).not.toBeInTheDocument();

    // The heading of the first pane is the page's heading, and it is the map's.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      /Kerala's 14 districts by the front that runs the district panchayat, 2025/,
    );
    const map = screen.getAllByTestId("drill-map")[0];
    expect(
      heading.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("reads the front colours down the side of the map", async () => {
    renderAt("/elections?cycle=2025");

    const legend = await screen.findByRole("list", { name: "Front colours" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(4);
    // The footnote about the fronts beyond the four colours moved to the
    // source line, where the rest of the accounting for the colours sits.
    expect(within(legend).queryByText(/BJP\+/)).not.toBeInTheDocument();
  });
});

describe("the panes a selection opens", () => {
  it("opens a district on its own result and both tiers below it", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.click(await screen.findByRole("button", { name: /THRISSUR/ }));

    expect(address()).toBe("/elections?cycle=2025&district=THRISSUR");
    // Its own election, then the two elections under it. Three panes, and no
    // sentence explaining that they are three.
    expect(
      await screen.findByRole("heading", { name: "THRISSUR District Panchayat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /block panchayats in THRISSUR, 2025/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /grama panchayats and urban bodies in THRISSUR, 2025/,
      }),
    ).toBeInTheDocument();
  });

  it("leaves the state pane on screen and clickable under the district", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025&district=THRISSUR");

    // Reselecting a level is a scroll, not a back-click: the district map is
    // still there to be used.
    await user.click(await screen.findByRole("button", { name: /KANNUR/ }));

    expect(address()).toBe("/elections?cycle=2025&district=KANNUR");
  });

  it("opens a body's wards and populates the ward table", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025&district=THRISSUR");

    await user.click(await screen.findByRole("button", { name: /open the wards of Chalakudy/ }));

    expect(address()).toBe("/elections/M08032/2025");
    expect(await wardRows()).toHaveLength(37);
    expect(tile(/result in ward 7\./)).toBeInTheDocument();
  });

  it("opens a ward in a pane under the map it was picked on", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    await user.click(await screen.findByRole("button", { name: /result in ward 7\./ }));

    expect(address()).toBe("/elections/M08032/2025?ward=7");
    const wards = pane(/Wards of Chalakudy Municipality, 2025/);
    const one = pane(/Ward 7 .*Chalakudy Municipality, 2025/);
    // Below, in reading order: a selection appends a chapter rather than
    // replacing the one it was made in.
    expect(
      wards.compareDocumentPosition(one) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const card = within(one).getByRole("region", { name: /Result for Ward 7/ });
    expect(within(card).getByText(/Winner 7 of 2025/)).toBeInTheDocument();
    expect(within(card).getByText("642")).toBeInTheDocument();
    expect(within(card).getByText("Runner-up 7")).toBeInTheDocument();
    expect(within(card).getByText(/21\.0% of 1,160 valid votes/)).toBeInTheDocument();
    expect(within(card).getByText("SC")).toBeInTheDocument();
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

    await user.hover(await screen.findByRole("button", { name: /THRISSUR/ }));

    expect(screen.getAllByTestId("map-hover")[0]).toHaveTextContent(
      /THRISSUR.*Click to open the three tiers elected in THRISSUR\./,
    );
  });

  it("walks back out along the rail without dropping the cycle", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2020");

    await user.click(await screen.findByRole("link", { name: "THRISSUR" }));

    expect(address()).toBe("/elections?cycle=2020&district=THRISSUR");
    expect(
      await screen.findByRole("heading", { name: /block panchayats in THRISSUR, 2020/ }),
    ).toBeInTheDocument();
  });
});

describe("what the drill-down reports", () => {
  it("counts a step down the map, and the level it lands on", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.click(await screen.findByRole("button", { name: /THRISSUR/ }));
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

  it("counts nothing when the rail walks back out", async () => {
    const user = userEvent.setup();
    renderAt("/elections/M08032/2025");

    await user.click(await screen.findByRole("link", { name: "THRISSUR" }));

    expect(tracked).not.toHaveBeenCalled();
  });

  it("counts nothing for a hover", async () => {
    const user = userEvent.setup();
    renderAt("/elections?cycle=2025");

    await user.hover(await screen.findByRole("button", { name: /THRISSUR/ }));

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

  it("closes the ward pane rather than carrying ward 7 across a delimitation", async () => {
    // Chalakudy has 36 wards in 2020 and 37 in 2025. Ward 7 of one is not
    // ward 7 of the other, and 1,136 of 1,199 bodies are like it.
    renderAt("/elections/M08032/2025?ward=7");
    await screen.findByRole("region", { name: /Result for Ward 7/ });

    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });

    await waitFor(() => expect(address()).toBe("/elections/M08032/2020"));
    expect(screen.queryByRole("region", { name: /Result for Ward 7/ })).not.toBeInTheDocument();
    // And it rests at the body, which is still open.
    expect(await wardRows()).toHaveLength(36);
  });

  it("says how many wards the body had either side of the delimitation", async () => {
    // Muttar has 13 wards in 2020 and 14 in 2025.
    renderAt("/elections/G04036/2025");

    expect(
      await screen.findByText(
        /14 wards in 2025, 13 in 2020\. Ward numbers are not the same divisions across a delimitation\./,
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about a delimitation where the count did not move", async () => {
    renderAt("/elections/M07025/2025");
    await screen.findByRole("table", { name: /Ward results/ });

    expect(screen.queryByText(/not the same divisions/)).not.toBeInTheDocument();
  });

  it("rests at the district and says which body the cycle took away", async () => {
    // Panoor last contested in 2015. In 2020 there is no body pane to rest at.
    renderAt("/elections/G13064/2020");

    expect(
      await screen.findByText(
        "Panoor Grama Panchayat last contested in 2015. The 2020 cycle has no result for it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Ward results/ })).not.toBeInTheDocument();
    // The panes above it are open, and the reader is left on the deepest.
    expect(
      screen.getByRole("heading", { name: /grama panchayats and urban bodies in KANNUR/ }),
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
    expect(screen.queryByRole("table", { name: /Ward results/ })).not.toBeInTheDocument();
  });

  it("lists a body with no boundary polygon, with its reason", async () => {
    // Panoor contested in 2015 and no layer holds a polygon for it. It is not
    // dropped from the page for that: the result is published, the shape is
    // what is missing, and those are different facts.
    renderAt("/elections?cycle=2015&district=KANNUR");

    expect(
      await screen.findByText(/In this cycle, not on this map/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/local body layer holds no polygon for these/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panoor" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open the wards of Panoor/ }),
    ).not.toBeInTheDocument();
  });
});

describe("wards before 2025", () => {
  it("draws the body's outline with a block of cells inside it", async () => {
    // No ward geometry exists before 2025 and 2025's own wards are not a
    // substitute: the counts differ in 95% of bodies, so there is no
    // ward-to-ward correspondence to borrow.
    renderAt("/elections/G04036/2020");
    await screen.findByRole("table", { name: /Ward results/ });

    await waitFor(() => {
      const maps = screen.getAllByTestId("drill-map");
      expect(maps[maps.length - 1]).toHaveAttribute("data-outline", "published");
    });
    expect(
      screen.getByText(/where a cell sits says nothing about where its ward was/),
    ).toBeInTheDocument();
  });

  it("draws the cells alone for 2010, which publishes no outline either", async () => {
    renderAt("/elections/G04036/2010");
    await screen.findByRole("table", { name: /Ward results/ });

    const maps = screen.getAllByTestId("drill-map");
    expect(maps[maps.length - 1]).toHaveAttribute("data-outline", "none");
    expect(screen.getAllByText(/Cells, not boundaries/).length).toBeGreaterThan(0);
  });
});

describe("the sources", () => {
  it("lists each layer as a bare link, with its size and its file", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });

    expect(within(sources).getAllByRole("listitem")).toHaveLength(7);
    expect(within(sources).getByText("56.9 MB")).toBeInTheDocument();
    expect(
      within(sources).getByText(/1,033 of 1,238 local bodies have a boundary/),
    ).toBeInTheDocument();
  });

  it("states a vintage once per source, not once per layer", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });

    // Four KSMART layers and three from opendatakerala. The vintage is a
    // property of the source, so it is stated twice and not seven times.
    expect(
      within(sources).getAllByText(/Boundaries: November 2020 snapshot/),
    ).toHaveLength(1);
    expect(
      within(sources).getAllByText(/Boundaries: current \(KSMART tile server\)/),
    ).toHaveLength(1);
  });

  it("states the ODbL attribution once, not once per layer", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });

    // A licence condition on redistribution, and a rendered map is
    // redistribution. Three layers carry it; the reader is told once.
    expect(within(sources).getAllByText(/© OpenStreetMap contributors/)).toHaveLength(1);
    expect(
      within(sources).getAllByText(/KSMART publishes no open licence/),
    ).toHaveLength(1);
  });

  it("names the fronts that have no colour of their own", async () => {
    renderAt("/elections?cycle=2025");

    const sources = await screen.findByRole("region", { name: "Sources" });
    expect(within(sources).getByText(/BJP\+ among them/)).toBeInTheDocument();
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
  });
});

/**
 * The three rural tiers.
 *
 * A voter in rural Kerala casts three ballots — a grama panchayat ward, a
 * block panchayat ward, a district panchayat ward — to three bodies elected
 * separately over the same ground. The fixture slice has no district holding
 * both a block panchayat and its grama panchayats, so these cases build one:
 * a district panchayat, two block panchayats, three grama panchayats and a
 * municipality that belongs to none of them.
 */
describe("the three elections a district holds", () => {
  const DISTRICT = "THRISSUR";

  const tierBodies = [
    { code: "D08001", name: "Thrissur DP", type: "District Panchayat", front: "LDF" },
    { code: "B08076", name: "Chalakudy Block", type: "Block Panchayat", front: "UDF" },
    { code: "B08077", name: "Mala Block", type: "Block Panchayat", front: "LDF" },
    { code: "G08001", name: "Kadukutty", type: "Grama Panchayat", front: "LDF" },
    { code: "G08002", name: "Koratty", type: "Grama Panchayat", front: "LDF" },
    { code: "G08003", name: "Annamanada", type: "Grama Panchayat", front: "UDF" },
    { code: "M08032", name: "Chalakudy", type: "Municipality", front: "UDF" },
  ];

  /** Two of the three grama panchayats are in the first block, one in the second. */
  const OF_BLOCK: Record<string, string> = {
    G08001: "B08076",
    G08002: "B08076",
    G08003: "B08077",
  };

  function useTierFixture(
    lastCycleOf: Record<string, number> = {},
    firstCycleOf: Record<string, number> = {},
  ) {
    const stood = (code: string, cycle: number) =>
      cycle >= (firstCycleOf[code] ?? 2010) && cycle <= (lastCycleOf[code] ?? 2025);

    server.use(
      http.get("*/api/bodies", () =>
        HttpResponse.json({
          bodies: tierBodies.map((body) => ({
            lb_code: body.code,
            lb_name_en: body.name,
            lb_name_ml: null,
            district_name: DISTRICT,
            lb_type: body.type,
            has_finances: false,
            has_meetings: false,
            has_geometry: true,
            in_elections: true,
            first_cycle: firstCycleOf[body.code] ?? 2010,
            last_cycle: lastCycleOf[body.code] ?? 2025,
            finance_years: [],
            meeting_years: [],
            years_with_finance: 0,
            years_with_meetings: 0,
            block_lb_code: OF_BLOCK[body.code] ?? null,
            district_panchayat_lb_code:
              body.type === "Grama Panchayat" ? "D08001" : null,
          })),
          count: tierBodies.length,
          districts: [DISTRICT],
          financial_years: [],
          cycles: [2010, 2015, 2020, 2025],
          provenance,
        }),
      ),
      http.get("*/api/elections/fronts/:cycle", ({ params }) => {
        const cycle = Number((params as { cycle: string }).cycle);
        const entries = tierBodies
          .filter((body) => stood(body.code, cycle))
          .map((body) => ({
            lb_code: body.code,
            district_name: DISTRICT,
            lb_type: body.type,
            ruling_front: body.front,
            control_type: "majority",
            total_wards: 13,
          }));
        const dp = entries.find((e) => e.lb_type === "District Panchayat");
        return HttpResponse.json({
          cycle,
          bodies: entries,
          districts: [
            {
              district_name: DISTRICT,
              bodies: entries.length,
              lb_code: dp?.lb_code ?? null,
              ruling_front: dp?.ruling_front ?? null,
              control_type: dp?.control_type ?? null,
            },
          ],
          count: entries.length,
          provenance,
        });
      }),
      http.get("*/geo/block-membership.json", () =>
        HttpResponse.json({
          of_block: OF_BLOCK,
          blocks: [
            { lb_code: "B08076", grama_panchayats: ["G08001", "G08002"] },
            { lb_code: "B08077", grama_panchayats: ["G08003"] },
          ],
          count: 3,
          blocks_count: 2,
        }),
      ),
    );
  }

  it("opens a block panchayat on the grama panchayats inside it", async () => {
    useTierFixture();
    const user = userEvent.setup();
    renderAt(`/elections?cycle=2025&district=${DISTRICT}`);

    await user.click(
      await screen.findByRole("button", {
        name: /open the grama panchayats in Chalakudy Block/,
      }),
    );

    expect(address()).toBe("/elections?cycle=2025&district=THRISSUR&block=B08076");
    // Its two grama panchayats and neither of the other block's.
    expect(
      await screen.findByRole("button", { name: /open the wards of Kadukutty/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open the wards of Koratty/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open the wards of Annamanada/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the block's pane open above the body opened from it", async () => {
    // "How did this district's grama panchayats vote" and "how did this
    // block's" are different questions. A reader who took the block route
    // keeps that pane above the body, so going back to it is a scroll.
    useTierFixture();
    const user = userEvent.setup();
    renderAt(`/elections?cycle=2025&district=${DISTRICT}&block=B08076`);

    await user.click(
      await screen.findByRole("button", { name: /open the wards of Kadukutty/ }),
    );

    expect(address()).toBe("/elections/G08001/2025?block=B08076");
    expect(
      screen.getByRole("region", {
        name: /grama panchayats in Chalakudy Block Block Panchayat, 2025/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /Wards of Kadukutty Grama Panchayat, 2025/ }),
    ).toBeInTheDocument();
  });

  it("carries the clicked body's own result on the pane it opened", async () => {
    useTierFixture();
    renderAt(`/elections?cycle=2025&district=${DISTRICT}&block=B08076`);

    const block = await screen.findByRole("region", {
      name: /grama panchayats in Chalakudy Block Block Panchayat, 2025/,
    });
    expect(within(block).getByText(/UDF majority, 13 wards/)).toBeInTheDocument();

    // Its own grama panchayats are LDF and the block is UDF. Two headings say
    // these are two elections; no sentence on the page repeats it.
    expect(
      within(block).getByRole("button", { name: /open the wards of Kadukutty/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/not a summary of this one/),
    ).not.toBeInTheDocument();
  });

  it("rests at the district when the cycle takes the block panchayat away", async () => {
    // Chalakudy Block last contested in 2015; the reader is at 2020.
    useTierFixture({ B08076: 2015 });
    renderAt(`/elections?cycle=2020&district=${DISTRICT}&block=B08076`);

    expect(
      await screen.findByText(
        "Chalakudy Block Block Panchayat last contested in 2015. The 2020 cycle has no result for it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open the wards of Kadukutty/ }),
    ).not.toBeInTheDocument();
  });

  it("rests at the district when the body was not yet constituted", async () => {
    // Kadukutty first contested in 2015; the reader is at 2010.
    useTierFixture({}, { G08001: 2015 });
    renderAt("/elections/G08001/2010");

    expect(
      await screen.findByText(
        "Kadukutty Grama Panchayat first contested in 2015. The 2010 cycle has no result for it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Ward results/ })).not.toBeInTheDocument();
  });

  it("lists urban bodies alongside the block panchayats rather than inside one", async () => {
    useTierFixture();
    renderAt(`/elections?cycle=2025&district=${DISTRICT}`);

    expect(
      await screen.findByText(/Municipalities and corporations, which sit in no block panchayat/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chalakudy" })).toBeInTheDocument();
  });

  it("names the bodies that contested in 2010 and were never placed", async () => {
    // Annamanada's last election was 2010: it was absorbed into a municipality
    // in 2015, before any boundary layer was drawn, so no map of any cycle has
    // a place for it. Its result is published all the same.
    useTierFixture({ G08003: 2010 });
    renderAt(`/elections?cycle=2010&district=${DISTRICT}`);

    expect(
      await screen.findByText(/Contested in 2010, no position published/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Annamanada" })).toBeInTheDocument();
    expect(
      screen.getByText(/Their results are here; a place on the map is what does not exist/),
    ).toBeInTheDocument();
  });

  it("says whether the shapes on screen are boundaries or squares", async () => {
    useTierFixture();
    renderAt(`/elections?cycle=2010&district=${DISTRICT}`);

    // 2010 has no layer at any level, deliberately, so everything is squares
    // and the page says so rather than letting a grid read as geography.
    expect((await screen.findAllByText(/Squares, not boundaries/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Published boundaries/)).not.toBeInTheDocument();
  });
});
