/**
 * The home page, and the four things on it that can go quietly wrong.
 *
 * The page states figures the Elections, Finances and Meetings sections state
 * again in their own tables. A figure typed into a page stays right until the
 * next database build and then stays wrong with the same confidence, so the
 * tests that matter are the ones that move a fixture and expect the page to
 * move with it, and the ones that check what the page says when a portal
 * answers with no figures in it.
 *
 * That last case is the one worth being explicit about, because it is a
 * success and not an error. Elections answers 200 with `available: false`,
 * finances flags a year `has_data: false`, and a panel that caught only the
 * error path would render blank cells and call it done. The panels fall back
 * to the published snapshot and name its date; the Amboori paragraph does not,
 * because that sentence is a claim about the two portals agreeing and half of
 * it is a different claim rather than a weaker one.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import HomeSection from "../HomeSection";
import { EXAMPLE_CYCLE } from "@/components/home/WorkedExample";
import SiteFooter from "@/components/shell/SiteFooter";
import { provenance } from "@/test/handlers";
import { server } from "@/test/setup";

const AMBOORI = "G01014";
const YEAR = "2023-2024";
const CYCLE = EXAMPLE_CYCLE;

/** Amboori 2023-24 as the live API returns it. */
const financesPayload = {
  lb_code: AMBOORI,
  year_label: YEAR,
  is_complete: true,
  available: true,
  reason_code: null,
  projects: 151,
  formulation: 268282526,
  expense: 50856455,
  expense_pct: 19,
  project_rows: [],
  provenance,
};

/** The fourteen-year series panel 02 draws. */
function seriesPayload(over: Record<string, unknown> = {}) {
  return {
    lb_code: AMBOORI,
    body: {
      lb_code: AMBOORI,
      lb_name_en: "Amboori",
      lb_name_ml: null,
      district_name: "THIRUVANANTHAPURAM",
      lb_type: "Grama Panchayat",
    },
    available: true,
    reason_code: null,
    years: [
      {
        year_label: "2022-2023",
        is_complete: true,
        has_data: true,
        projects: 98,
        formulation: 98000000,
        expense: 38000000,
        expense_pct: 38.8,
        projects_with_pdf: 40,
        also_in_prev_year: null,
        first_seen_this_year: null,
      },
      {
        year_label: YEAR,
        is_complete: true,
        has_data: true,
        projects: 151,
        formulation: 268282526,
        expense: 50856455,
        expense_pct: 19,
        projects_with_pdf: 70,
        also_in_prev_year: null,
        first_seen_this_year: null,
      },
    ],
    years_with_finance: 2,
    provenance,
    ...over,
  };
}

/** Every year present and every year empty: a 200 with no figures in it. */
function emptySeries() {
  return seriesPayload({
    years: seriesPayload().years.map((year) => ({
      ...year,
      has_data: false,
      projects: null,
      formulation: null,
      expense: null,
      expense_pct: null,
    })),
  });
}

/** 38 meetings, 32 of which published minutes. */
function meetingRows(withMinutes: number, total: number) {
  return Array.from({ length: total }, (_, i) => ({
    meeting_id: 1000 + i,
    meeting_date: "2023-04-22",
    meeting_no: String(i + 1),
    meeting_type: "ഭരണസമിതി യോഗം",
    meeting_nature: "സാധാരണ യോഗം",
    venue: null,
    category_code: null,
    documents: i < withMinutes ? ["dr", "minutes"] : [],
  }));
}

function meetingsPayload(over: Record<string, unknown> = {}) {
  return {
    lb_code: AMBOORI,
    year_label: YEAR,
    is_complete: true,
    body: {
      lb_code: AMBOORI,
      lb_name_en: "Amboori",
      lb_name_ml: null,
      district_name: "THIRUVANANTHAPURAM",
      lb_type: "Grama Panchayat",
    },
    available: true,
    reason_code: null,
    meetings: 38,
    governing_body: 38,
    standing_committee: 0,
    ordinary: 25,
    special: 13,
    first_meeting: "2023-04-22",
    last_meeting: "2024-03-30",
    meeting_rows: meetingRows(32, 38),
    scope_note: "",
    provenance,
    ...over,
  };
}

/**
 * The three endpoints the example reads for Amboori. G01014 is outside the
 * seven-body fixture slice, so finances and meetings answer 404 by default and
 * every happy-path test installs these.
 *
 * The payloads are typed loosely on purpose -- several tests hand in partial
 * or malformed bodies to exercise the fallback, which is the whole point of
 * being able to override them.
 */
function amboori(
  finances: JsonBodyType = financesPayload,
  meetings: JsonBodyType = meetingsPayload(),
  series: JsonBodyType = seriesPayload(),
) {
  server.use(
    http.get(`*/api/finances/${AMBOORI}`, () => HttpResponse.json(series)),
    http.get(`*/api/finances/${AMBOORI}/${YEAR}`, () => HttpResponse.json(finances)),
    http.get(`*/api/meetings/${AMBOORI}/${YEAR}`, () => HttpResponse.json(meetings)),
  );
}

/** Reads the router's current path back out, for the gate tests. */
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <HomeSection />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("the hero and the stat strip", () => {
  it("opens on the canvas headline and its primary action", async () => {
    amboori();
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "Explore local government activity" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start with one local government" }),
    ).toHaveAttribute("href", "#amboori");

    // The canvas lede addressed the reader directly. docs/instructions.md
    // section 11 allows that only in a method note.
    const lede = screen.getByText(/local governments plan, deliberate and spend/i);
    expect(lede).toHaveTextContent("connects those portals into one picture");
    expect(document.body.textContent).not.toMatch(/giving you/i);
  });

  it("names the population each count covers", async () => {
    amboori();
    renderHome();

    const strip = screen.getByRole("region", { name: "What this site holds" });

    // The Commission's own seat total for the cycle, read from the aggregate
    // rather than typed. 1,033, 1,199 and 1,238 are all correct counts of
    // Kerala's local governments, so every figure says which one it is over.
    expect(await within(strip).findByText("21,820")).toBeInTheDocument();
    expect(strip).toHaveTextContent("across the 1,199 local governments that contested it");
    expect(strip).toHaveTextContent("941 grama panchayats, 86 municipalities and 6 corporations");
    expect(strip).toHaveTextContent("3.6 million");
    expect(strip).toHaveTextContent("455,000+");
    // The close-margin count is the aggregate's own narrowest band, read live
    // rather than typed. The canvas said "915 under ten votes"; the record has
    // no ten-vote band to answer that from.
    expect(strip).toHaveTextContent("4,567");
    expect(strip).toHaveTextContent("Wards won by under 50 votes");
    expect(strip).toHaveTextContent("of the 20,962 wards with a published ward result");

    // The counts the aggregate does not answer are a snapshot, and say so.
    expect(strip).toHaveTextContent("4 September 2026");
  });
});

describe("the ask card", () => {
  it("routes both buttons to the two account pages", async () => {
    amboori();
    renderHome();

    for (const [name, path] of [
      ["Sign in to ask", "/login"],
      ["Create an account", "/register"],
    ] as const) {
      const links = screen.getAllByRole("link", { name });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute("href", path);
    }
  });

  it("takes the locked field to the sign-in page on a click", async () => {
    amboori();
    renderHome();

    fireEvent.click(screen.getByTestId("hero-locked-field"));
    expect(screen.getByTestId("where")).toHaveTextContent("/login");
  });

  it("takes the locked field to the sign-in page on a focus", async () => {
    // The largest target on the card. A disabled input would sit inert under
    // the pointer, which teaches a reader that the card is broken.
    amboori();
    renderHome();

    fireEvent.focus(screen.getByTestId("hero-locked-field"));
    expect(screen.getByTestId("where")).toHaveTextContent("/login");
  });

  it("answers its three sample questions on this page, with no account", async () => {
    amboori();
    renderHome();

    const anchors = [
      ["Show me one panchayat in full", "#amboori"],
      ["Which councils are hung?", "#statewide-control"],
      ["Which wards were won by under 50 votes?", "#statewide-margins"],
    ] as const;

    for (const [name, href] of anchors) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
    }

    // Each anchor has to land on something. A question that routes to a login
    // would make the heading above it false.
    await screen.findByTestId("statewide");
    for (const [, href] of anchors) {
      expect(document.querySelector(href)).not.toBeNull();
    }
    expect(screen.getByTestId("where")).toHaveTextContent("/");
  });
});

describe("the three panels", () => {
  it("states the council the wards elected, computed from the rows", async () => {
    amboori();
    renderHome();

    expect(
      await screen.findByText(/The UDF holds the council 8 wards to 6/),
    ).toHaveTextContent("Ward 8 was won by 4 votes");
  });

  it("moves when the result moves", async () => {
    server.use(
      http.get(`*/api/elections/${AMBOORI}/${CYCLE}`, () =>
        HttpResponse.json({
          lb_code: AMBOORI,
          cycle: CYCLE,
          body: { lb_name_en: "Amboori", lb_type: "Grama Panchayat" },
          available: true,
          reason_code: null,
          seats: { LDF: 2, UDF: 1, NDA: 0, OTH: 0 },
          total_wards: 3,
          majority_threshold: 2,
          largest_front: "LDF",
          largest_front_seats: 2,
          ruling_front: "LDF",
          control_type: "majority",
          wards: [
            ward(1, "Mayam", "Woman", "CPI(M)", "LDF", 21),
            ward(2, "Amboori", "General", "INC", "UDF", 171),
            ward(3, "Kuttamala", "Woman", "CPI(M)", "LDF", 9),
          ],
          candidates: [],
          provenance,
        }),
      ),
    );
    amboori();
    renderHome();

    expect(
      await screen.findByText(/The LDF holds the council 2 wards to 1/),
    ).toHaveTextContent("Ward 3 was won by 9 votes");
  });

  it("draws the real wards, and says which cycle publishes them", async () => {
    amboori();
    renderHome();

    // The example runs on 2025 because that is the only cycle Kerala publishes
    // ward boundaries for, so this panel draws Amboori's own wards rather than
    // numbered cells standing in for them. The caption says so, because the
    // earlier cycles on the elections page do not get a real map.
    expect(
      await screen.findByText(/each drawn on the boundary published for that cycle/),
    ).toHaveTextContent("the earlier ones are on the elections page");
  });

  it("says Sulekha publishes no sector and none is inferred", async () => {
    amboori();
    renderHome();

    expect(
      await screen.findByText(/Sulekha publishes no sector or category/),
    ).toHaveTextContent("none is inferred");
  });

  it("shows both meeting splits from the register", async () => {
    amboori();
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "Governing body and standing committee" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ordinary and special" }),
    ).toBeInTheDocument();
  });
});

describe("a portal that answers with no figures in it", () => {
  it("labels the snapshot and names its date when the result is unavailable", async () => {
    amboori();
    server.use(
      http.get(`*/api/elections/${AMBOORI}/${CYCLE}`, () =>
        HttpResponse.json({
          lb_code: AMBOORI,
          cycle: CYCLE,
          body: {},
          available: false,
          reason_code: "no_result_published",
          reason: "The Commission published no result for this body.",
          first_cycle: null,
          last_cycle: null,
          provenance,
        }),
      ),
    );
    renderHome();

    const notice = await screen.findByText(/ward results did not load/i);
    expect(notice).toHaveTextContent("4 September 2026");

    // Not a blank panel: the canvas's own rows, behind the notice.
    expect(screen.getByText("Kannannoor")).toBeInTheDocument();
  });

  it("does the same when every financial year is flagged as holding nothing", async () => {
    amboori(financesPayload, meetingsPayload(), emptySeries());
    renderHome();

    const notice = await screen.findByText(/year-by-year plan figures did not load/i);
    expect(notice).toHaveTextContent("4 September 2026");
  });
});

describe("the statewide block", () => {
  it("renders the four distributions for the cycle", async () => {
    amboori();
    renderHome();

    const block = await screen.findByTestId("statewide");
    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent(
      `The same election across Kerala, ${CYCLE}`,
    );

    for (const heading of [
      "Ward seats by front",
      "Wards by winning margin",
      "Councils by control",
      "Ward seats by reservation",
    ]) {
      expect(within(block).getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    // Every share states what it is a share of.
    expect(block).toHaveTextContent("21,820 seats the Commission reported across 1,199");
    expect(block).toHaveTextContent("Shares of the 20,962 wards");
    expect(block).toHaveTextContent("Shares of the 1,199 local governments");
  });

  it("shows the same cycle as the worked example", async () => {
    amboori();
    renderHome();

    const block = await screen.findByTestId("statewide");
    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent(String(CYCLE));

    const table = await screen.findByRole("table", {
      name: new RegExp(`Ward results, Amboori grama panchayat, ${CYCLE}`),
    });
    expect(table).toBeInTheDocument();
  });

  it("states the cause rather than drawing a chart of noughts", async () => {
    amboori();
    server.use(
      http.get("*/api/elections/statewide/:cycle", () =>
        HttpResponse.json({
          cycle: CYCLE,
          available: false,
          reason_code: "no_result_for_cycle",
          reason: "The State Election Commission has published no result for any local body in this cycle.",
          bodies_with_result: 0,
          wards_counted: 0,
          seats: [],
          seats_total: null,
          margins: [],
          control: [],
          reservation: [],
          provenance,
        }),
      ),
    );
    renderHome();

    expect(
      await screen.findByText(/published no result for any local body/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ward seats by front" })).toBeNull();
  });
});

describe("the Amboori example", () => {
  it("states the figures the two endpoints returned", async () => {
    amboori();
    renderHome();

    const paragraph = await screen.findByText(/formulated 151 projects/);
    expect(paragraph).toHaveTextContent("₹26.83 crore");
    expect(paragraph).toHaveTextContent("spent ₹5.09 crore");
    expect(paragraph).toHaveTextContent("19.0 per cent of the planned amount");
    expect(paragraph).toHaveTextContent("council sat 38 times");
    expect(paragraph).toHaveTextContent("25 ordinary meetings and 13 special ones");
    // Counted from the rows, not read off a field: the payload has no count of
    // meetings with minutes, and the sections count them the same way.
    expect(paragraph).toHaveTextContent("published minutes for 32 of them");
  });

  it("moves when the record moves", async () => {
    // The point of the whole component. The panchayat spends a third of a
    // smaller plan and its council meets less; every figure in the paragraph,
    // the rail included, has to follow.
    amboori(
      { ...financesPayload, projects: 96, formulation: 100000000, expense: 33000000, expense_pct: 33 },
      meetingsPayload({
        meetings: 20,
        ordinary: 15,
        special: 5,
        meeting_rows: meetingRows(11, 20),
      }),
    );
    renderHome();

    const paragraph = await screen.findByText(/formulated 96 projects/);
    expect(paragraph).toHaveTextContent("₹10.00 crore");
    expect(paragraph).toHaveTextContent("spent ₹3.30 crore");
    expect(paragraph).toHaveTextContent("33.0 per cent");
    expect(paragraph).toHaveTextContent("council sat 20 times");
    expect(paragraph).toHaveTextContent("published minutes for 11 of them");

    // "a fifth" is the site's phrase for 19%. At 33% it has to become the other
    // one, or the sentence is a hardcoded figure wearing a disguise.
    expect(
      screen.getByText(/a council that met 20 times spent a third of its plan/),
    ).toBeInTheDocument();

    const rail = screen.getByText(/this is the half Sakarma holds/);
    expect(rail).toHaveTextContent("20");
    expect(rail).toHaveTextContent("15 ordinary and 5 special");
    expect(rail).toHaveTextContent("minutes published for 11");
  });

  it("says a fifth where the share is a fifth", async () => {
    amboori();
    renderHome();

    expect(
      await screen.findByText(/a council that met 38 times spent a fifth of its plan/),
    ).toBeInTheDocument();
  });

  it("gives the number where no fraction is close enough to name", async () => {
    amboori({ ...financesPayload, expense_pct: 41.2 });
    renderHome();

    expect(
      await screen.findByText(/spent 41.2 per cent of its plan/),
    ).toBeInTheDocument();
  });

  it("shows nothing rather than half a sentence while it loads", () => {
    amboori();
    renderHome();

    expect(screen.getByText(/^Reading Amboori/)).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(/formulated 151 projects/)).not.toBeInTheDocument();
    // No rail either: a rail drawn from a payload the prose did not get would
    // be the contradiction the whole unit exists to prevent.
    expect(screen.queryByText(/this is the half Sakarma holds/)).not.toBeInTheDocument();
  });

  it("says the figures did not load rather than stating a gap", async () => {
    server.use(
      http.get(`*/api/finances/${AMBOORI}/${YEAR}`, () => HttpResponse.error()),
      http.get(`*/api/meetings/${AMBOORI}/${YEAR}`, () => HttpResponse.error()),
    );
    renderHome();

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("Amboori’s figures did not load"))).toBe(
      true,
    );
    expect(screen.queryByText(/formulated 151 projects/)).not.toBeInTheDocument();
    expect(screen.queryByText(/this is the half Sakarma holds/)).not.toBeInTheDocument();
  });

  it("withholds the example when only one of the two portals answers", async () => {
    amboori(financesPayload, {
      lb_code: AMBOORI,
      year_label: YEAR,
      is_complete: true,
      available: false,
      reason_code: "no_record_for_year",
      reason: "Sakarma publishes no meetings for 2023-2024.",
      provenance,
    });
    renderHome();

    // Half the paragraph is Sulekha's and half is Sakarma's. One half is not
    // the same sentence with less in it.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("Amboori’s figures did not load"))).toBe(
      true,
    );
    expect(screen.queryByText(/formulated 151 projects/)).not.toBeInTheDocument();
  });
});

describe("attribution", () => {
  it("credits the two authors and no institution", () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Abishek Choutagunta");
    expect(footer).toHaveTextContent("Tushar Anand");

    // The fellowship proposal describes an arrangement being applied for. None
    // of these built this site, and a name in a footer reads as an endorsement.
    for (const name of ["Ruhr", "DAAD", "CRISP", "Bochum"]) {
      expect(footer).not.toHaveTextContent(name);
    }
  });

  it("links the domain that resolves", () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "gramsambandh.co.in" })).toHaveAttribute(
      "href",
      "https://gramsambandh.co.in",
    );
    expect(
      screen.queryByRole("link", { name: "gramsambandh.in" }),
    ).not.toBeInTheDocument();
  });

  // The ODbL requires the boundary attribution to travel with the data, and
  // this page carried the site's only copy of it before the rewrite. The essay
  // it sat under is gone; the licence line is not.
  it("keeps the OpenStreetMap attribution the licence requires", () => {
    amboori();
    renderHome();

    const colophon = screen.getByText(/OpenStreetMap contributors/);
    expect(colophon).toHaveTextContent("Open Database License 1.0");
    expect(colophon).toHaveTextContent("opendatakerala");
  });
});

/** One ward row of the shape `/api/elections/{lb}/{cycle}` returns. */
function ward(
  no: number,
  name: string,
  reservation: string,
  party: string,
  front: string,
  margin: number,
) {
  return {
    ward_no: no,
    ward_code: `${AMBOORI}${String(no).padStart(3, "0")}`,
    ward_name: name,
    ward_name_ml: null,
    reservation,
    winner_name: `Winner ${no}`,
    winner_party: party,
    winner_front: front,
    winner_votes: 500 + margin,
    winner_role: null,
    winner_gender: null,
    runnerup_name: `Runner-up ${no}`,
    runnerup_votes: 500,
    margin,
    margin_pct: null,
    valid_votes: 1060 + margin,
    invalid_votes: 8,
    candidates: 3,
    uncontested: false,
    tie: false,
  };
}
