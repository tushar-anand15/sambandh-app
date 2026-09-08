/**
 * The method page.
 *
 * Its job is to be checkable, so the tests check the two things a reader would
 * use it for: the year a local body count changed, and which boundary set a
 * cycle's map is actually drawn on. The second is where a method page is most
 * tempted to soften, and where softening does the most damage: a 2010 map drawn
 * on a November 2020 snapshot is a useful approximation when it says so and a
 * false claim when it does not.
 */

import { render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import HomeSection from "@/sections/HomeSection";
import MethodSection from "../MethodSection";
import { handlers as methodHandlers, methodPayload } from "@/test/handlers.method";
import { server } from "@/test/setup";

function renderMethod() {
  return render(
    <MemoryRouter>
      <MethodSection />
    </MemoryRouter>,
  );
}

/** The table under a given caption. Year labels repeat across two of them. */
async function tableFor(caption: RegExp) {
  return (await screen.findByText(caption)).closest("table")!;
}

async function rowIn(caption: RegExp, name: string | RegExp) {
  const table = await tableFor(caption);
  return within(table).getByRole("rowheader", { name }).closest("tr")!;
}

const COVERAGE = /Projects and meetings per financial year/;
const BOUNDARIES = /The boundaries behind each election map/;

beforeEach(() => {
  server.use(...methodHandlers);
});

/**
 * The standing preamble.
 *
 * The statutory sequence is the argument for reading Sulekha and Sakarma
 * together: without it the site shows two records side by side and never says
 * why that is worth doing. It moved here when the home page was rewritten
 * around a worked example, so these tests check three things -- that it is
 * here, that it is above the computed sections rather than mixed into them,
 * and that it is not still on the home page as well.
 */
describe("the statutory sequence", () => {
  it("states the three steps the law requires", async () => {
    renderMethod();

    const steps = within(
      await screen.findByRole("list", { name: /three steps/i }),
    ).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual([
      "Formulate the annual plan in open assembly.",
      "Adopt each project by resolution of the elected council.",
      "Spend only against what was adopted.",
    ]);
  });

  it("names the statute and the report the figures come from", async () => {
    renderMethod();

    expect(
      await screen.findByText(/Kerala Panchayat Raj Act, 1994/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Report of the Fifteenth Finance Commission, 2021/),
    ).toBeInTheDocument();
    expect(screen.getByText(/2.36 lakh crore/)).toBeInTheDocument();
  });

  it("keeps the people the joined record answers to", async () => {
    renderMethod();

    expect(
      await screen.findByRole("heading", { name: "Who can use it?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Kerala Institute of Local Administration/),
    ).toBeInTheDocument();
    expect(screen.getByText(/eGramSwaraj and Meri Panchayat/)).toBeInTheDocument();
    expect(screen.getByText(/about 25 million residents/)).toBeInTheDocument();
  });

  it("sits above the computed sections, which keep their order", async () => {
    renderMethod();

    await screen.findByRole("heading", {
      name: "Which boundaries each election is drawn on",
    });
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "The sequence Kerala law requires",
      "What each section covers per year",
      "Which boundaries each election is drawn on",
    ]);
  });


  it("still renders when the request fails", async () => {
    server.use(http.get("*/api/method", () => HttpResponse.error()));

    renderMethod();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The sequence Kerala law requires" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: /three steps/i })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(3);
    // The computed half is absent, not half-drawn.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("is not left behind on the home page as well", async () => {
    render(
      <MemoryRouter>
        <HomeSection />
      </MemoryRouter>,
    );
    await waitForElementToBeRemoved(() => screen.queryByText(/^Reading Amboori/i));

    const text = document.body.textContent ?? "";
    for (const moved of [
      "Fifteenth Finance Commission",
      "formulate its annual plan in open assembly",
      "Kerala Institute of Local Administration",
      "Who can use it?",
    ]) {
      expect(text).not.toContain(moved);
    }
  });
});

describe("dataset coverage", () => {
  it("shows the thin early meeting years as thin, with the note", async () => {
    renderMethod();

    const row = await rowIn(COVERAGE, "2016–17");
    expect(within(row).getByText("8,989")).toBeInTheDocument();
    expect(within(row).getByText("545")).toBeInTheDocument();

    expect(
      screen.getByText(/Sakarma covers more local bodies every year/),
    ).toBeInTheDocument();
  });

  it("marks the open year", async () => {
    renderMethod();

    expect(await rowIn(COVERAGE, /2025–26/)).toHaveTextContent("(in progress)");
    expect(await rowIn(COVERAGE, "2024–25")).not.toHaveTextContent("(in progress)");
  });
});

describe("boundary vintage", () => {
  it("gives one row per cycle, newest first", async () => {
    renderMethod();

    const table = await tableFor(BOUNDARIES);
    const headers = within(table)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["2025", "2020", "2015", "2010"]);
  });

  it("does not soften the reuse of one snapshot for three cycles", async () => {
    renderMethod();

    for (const cycle of ["2015", "2010"]) {
      const row = await rowIn(BOUNDARIES, cycle);
      expect(row).toHaveTextContent("November 2020 snapshot");
      expect(within(row).getByText("No")).toBeInTheDocument();
    }

    expect(await rowIn(BOUNDARIES, "2010")).toHaveTextContent(
      "47 of 2010's 1,208 bodies have no 2020-vintage counterpart",
    );
    expect(
      screen.getByText(/No ward-level geometry exists for 2010, 2015 or 2020/),
    ).toBeInTheDocument();
  });

  it("names 2025 as the only cycle with ward geometry", async () => {
    renderMethod();

    expect(await rowIn(BOUNDARIES, "2025")).toHaveTextContent("Ward");
    expect(await rowIn(BOUNDARIES, "2020")).toHaveTextContent("Local body");
  });
});


describe("when the endpoint is unreachable", () => {
  it("says the page did not load rather than rendering empty tables", async () => {
    server.use(http.get("*/api/method", () => HttpResponse.error()));

    renderMethod();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This page did not load",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
