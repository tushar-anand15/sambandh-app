/**
 * The home page, and the one thing on it that can go quietly wrong.
 *
 * The prose is checked by reading, not by a test. What a test can hold is the
 * coverage table: it is the only place on the page where a number appears, and
 * a number typed into a page stays right until the next rebuild and then stays
 * wrong without saying so. The test that matters here is the one that changes a
 * fixture count and expects the rendered figure to move with it.
 */

import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import HomeSection from "../HomeSection";
import SiteFooter from "@/components/shell/SiteFooter";
import { bodies, districts, financialYears, provenance } from "@/test/handlers";
import { resetBodiesCache } from "@/hooks/useBodies";
import { server } from "@/test/setup";



function renderHome() {
  return render(
    <MemoryRouter>
      <HomeSection />
    </MemoryRouter>,
  );
}

/** The row for one section of the coverage table. */
async function row(section: string) {
  const cell = await screen.findByRole("rowheader", { name: section });
  return cell.closest("tr")!;
}

beforeEach(() => {
  resetBodiesCache();
});

describe("the argument", () => {
  it("opens on the scale figures and the money", async () => {
    renderHome();

    expect(screen.getByText(/about 260,000 panchayats/)).toBeInTheDocument();
    expect(
      screen.getByText(/more than 800 million rural citizens/),
    ).toBeInTheDocument();
    expect(screen.getByText("₹2.36 lakh crore")).toBeInTheDocument();
    // The figure carries its source and its period, not just its size.
    expect(
      screen.getByText(/15th Finance Commission \(Report of the Fifteenth/),
    ).toBeInTheDocument();
  });

  it("states the frame the rest of the site rests on", async () => {
    renderHome();

    expect(
      screen.getByText(
        /Before a rupee is spent, the law requires citizens and their elected/,
      ),
    ).toBeInTheDocument();
  });

  it("names both portals and says they never shared a key", async () => {
    renderHome();

    const paragraph = screen.getByText(/have never\s+shared a key/);
    expect(paragraph).toHaveTextContent("plan.lsgkerala.gov.in");
    expect(paragraph).toHaveTextContent("meeting.lsgkerala.gov.in");
  });

  it("ends on the citizens, not on prospects", async () => {
    renderHome();

    const paragraphs = screen.getByRole("heading", {
      name: "Who this is for",
    }).parentElement!;
    expect(paragraphs).toHaveTextContent(/about 25 million residents/);
    expect(paragraphs).toHaveTextContent(/has been opaque/);
  });
});

describe("the coverage table", () => {
  it("renders one row per section, counted from the API", async () => {
    renderHome();

    const finances = await row("Finances");
    // Every body in the fixture slice has a plan record.
    expect(within(finances).getByText("7 of 7")).toBeInTheDocument();
    expect(within(finances).getByText("100.0%")).toBeInTheDocument();

    // Panoor has no Sakarma record; Mattannur has no published result.
    expect(within(await row("Meetings")).getByText("6 of 7")).toBeInTheDocument();
    expect(within(await row("Elections")).getByText("6 of 7")).toBeInTheDocument();

    // Boundaries count against the map's own inventory, which is the thing
    // that knows which bodies have geometry.
    expect(
      within(await row("Boundaries")).getByText("1,033 of 1,238"),
    ).toBeInTheDocument();
  });

  it("moves when the fixture moves", async () => {
    // The point of the whole component. Three bodies lose their meeting record;
    // the rendered figure has to follow, or the table is decoration.
    const thinner = bodies.map((body, i) =>
      i < 3 ? { ...body, has_meetings: false } : body,
    );

    server.use(
      http.get("*/api/bodies", () =>
        HttpResponse.json({
          bodies: thinner,
          count: thinner.length,
          districts,
          financial_years: financialYears,
          cycles: [2010, 2015, 2020, 2025],
          provenance,
        }),
      ),
    );

    renderHome();

    expect(within(await row("Meetings")).getByText("3 of 7")).toBeInTheDocument();
    expect(within(await row("Meetings")).getByText("42.9%")).toBeInTheDocument();
  });

  it("states the periods from the payload rather than from memory", async () => {
    renderHome();

    const period = await screen.findByText(/Finances run from/);
    expect(period).toHaveTextContent("2012–13 to 2025–26");
    expect(period).toHaveTextContent("2010, 2015, 2020, 2025");
  });

  it("carries the build the figures came from", async () => {
    renderHome();

    expect(await screen.findByTestId("source-line")).toHaveTextContent(
      "Gram Sambandh master database · Built 13 August 2026",
    );
  });

  it("says the figures did not load rather than showing zeroes", async () => {
    server.use(
      http.get("*/api/bodies", () => HttpResponse.error()),
      http.get("*/api/maps", () => HttpResponse.error()),
    );

    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The coverage figures did not load",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
    expect(footer).toHaveTextContent(
      "Gram Sambandh is built by Abishek Choutagunta and Tushar Anand.",
    );

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

  it("carries the OpenStreetMap attribution the licence requires", () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "© OpenStreetMap contributors",
    );
  });
});
