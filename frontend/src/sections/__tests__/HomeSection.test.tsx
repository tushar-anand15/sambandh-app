/**
 * The home page, and the one thing on it that can go quietly wrong.
 *
 * The prose is GS's and is checked by reading, not by a test — except where a
 * typo was fixed or a paragraph was nearly split, both of which a future edit
 * could undo without anyone noticing. Those are pinned here.
 *
 * What the rest of the file holds is the Amboori example. It is the only place
 * on the page where a figure appears, it states figures the finances and
 * meetings sections state again in their own tables, and a figure typed into a
 * page stays right until the next database build and then stays wrong with the
 * same confidence. So the tests that matter are the ones that move a fixture
 * and expect the sentence to move with it, and the ones that check the page
 * says nothing rather than half a sentence when the endpoints fail.
 */

import { render, screen } from "@testing-library/react";
import { http, HttpResponse, type JsonBodyType } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import HomeSection from "../HomeSection";
import SiteFooter from "@/components/shell/SiteFooter";
import { provenance } from "@/test/handlers";
import { server } from "@/test/setup";

const AMBOORI = "G01014";
const YEAR = "2023-2024";

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
 * The two endpoints the example reads. Amboori is outside the fixture slice.
 *
 * The payloads are typed loosely on purpose -- several tests hand in partial
 * or malformed bodies to exercise the error path, which is the whole point of
 * being able to override them. `JsonBodyType` is what HttpResponse.json takes.
 */
function amboori(
  finances: JsonBodyType = financesPayload,
  meetings: JsonBodyType = meetingsPayload(),
) {
  server.use(
    http.get(`*/api/finances/${AMBOORI}/${YEAR}`, () => HttpResponse.json(finances)),
    http.get(`*/api/meetings/${AMBOORI}/${YEAR}`, () => HttpResponse.json(meetings)),
  );
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomeSection />
    </MemoryRouter>,
  );
}

describe("GS's copy", () => {
  it("keeps the opening paragraph whole", () => {
    amboori();
    renderHome();

    // The allocation, the panchayat count and the population are one sentence
    // run, in one element. An earlier draft split them to make a display
    // figure out of ₹2.36 lakh crore, which is a number with a source in the
    // sentence it came from and no business being a poster.
    const opening = screen.getByText(/India devolves a substantial share/);
    expect(opening.tagName).toBe("P");
    expect(opening).toHaveTextContent("₹2.36 lakh crore");
    expect(opening).toHaveTextContent("Roughly 260,000 panchayats");
    expect(opening).toHaveTextContent("more than 800 million people");
  });

  it("keeps the two fixed typos fixed", () => {
    amboori();
    renderHome();

    const portals = screen.getByText(/have always been publicly accessible/);
    expect(portals).toHaveTextContent("not easy to decipher");
    expect(document.body.textContent).not.toMatch(/publically/);
    expect(document.body.textContent).not.toMatch(/not easy decipher/);
  });

  it("runs his four sections in his order", () => {
    amboori();
    renderHome();

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "How do we do it",
      "What happens if we join the records?",
      "Who can use it?",
    ]);
  });

  it("links both portals by name", () => {
    amboori();
    renderHome();

    for (const [name, href] of [
      ["Sulekha", "https://plan.lsgkerala.gov.in"],
      ["Sakarma", "https://meeting.lsgkerala.gov.in"],
    ]) {
      const links = screen.getAllByRole("link", { name });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link).toHaveAttribute("href", href);
    }
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
    // smaller plan and its council meets less; every figure in the section,
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

    // "a fifth" is GS's phrase for 19%. At 33% it has to become his other one,
    // or the sentence is a hardcoded figure wearing a disguise.
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

    expect(screen.getByText(/Reading Amboori/)).toHaveAttribute("aria-busy", "true");
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Amboori’s figures did not load",
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

    // Half the paragraph is Sulekha's and half is Sakarma's. One half is not a
    // sentence GS wrote.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
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

  // GS's copy carries no licence line, and this page held the site's only copy
  // of it. It stays, in the colophon under his last section: the ODbL requires
  // the attribution to travel with the boundary data, and a rewrite of the
  // prose around it is not a reason to drop it.
  it("keeps the OpenStreetMap attribution the licence requires", () => {
    amboori();
    renderHome();

    const colophon = screen.getByText(/OpenStreetMap contributors/);
    expect(colophon).toHaveTextContent("Open Database License 1.0");
    expect(colophon).toHaveTextContent("opendatakerala");
  });
});
