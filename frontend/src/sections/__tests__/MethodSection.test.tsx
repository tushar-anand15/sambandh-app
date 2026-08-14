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

import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

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

const BODIES = /Local bodies listed by Sulekha/;
const COVERAGE = /Projects and meetings per financial year/;
const BOUNDARIES = /The boundaries behind each election map/;

beforeEach(() => {
  server.use(...methodHandlers);
});

describe("local bodies per year", () => {
  it("renders every year the build holds", async () => {
    renderMethod();

    const table = await tableFor(BODIES);
    // Fourteen years, plus the header row.
    expect(within(table).getAllByRole("row")).toHaveLength(15);
  });

  it("shows the count falling from 1,208 to 1,200", async () => {
    renderMethod();

    expect(within(await rowIn(BODIES, "2012–13")).getByText("1,208")).toBeInTheDocument();
    expect(within(await rowIn(BODIES, "2016–17")).getByText("1,200")).toBeInTheDocument();
  });

  it("shows the year the list actually moved", async () => {
    renderMethod();

    const row = await rowIn(BODIES, "2015–16");
    expect(within(row).getByText("29")).toBeInTheDocument();
    expect(within(row).getByText("36")).toBeInTheDocument();
  });

  it("says there is no earlier year rather than writing zero", async () => {
    renderMethod();

    const first = await rowIn(BODIES, "2012–13");
    // A zero in the first row would read as a year in which nothing changed.
    expect(within(first).getAllByText("no earlier year")).toHaveLength(2);
  });

  it("states what the source does not record about a departure", async () => {
    renderMethod();

    expect(
      await screen.findByText(/may have been merged, split, renamed or reclassified/),
    ).toBeInTheDocument();
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

describe("the build", () => {
  it("names the dumps it was built from and the date it was built", async () => {
    renderMethod();

    expect(await screen.findByText("2026-08-13")).toBeInTheDocument();
    for (const dump of methodPayload.build.source_dumps) {
      expect(screen.getByText(new RegExp(dump))).toBeInTheDocument();
    }
    // Indian numbering, as everywhere else on the site: 36,05,452, not 3,605,452.
    expect(screen.getByText("36,05,452")).toBeInTheDocument();
    expect(screen.getByText("4,43,235")).toBeInTheDocument();
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
