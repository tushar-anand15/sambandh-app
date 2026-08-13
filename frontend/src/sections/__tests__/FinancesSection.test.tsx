/**
 * What the Finances page has to get right.
 *
 * The claims tested here are the ones a reader would be misled by if they
 * broke silently: a year with no record drawn as a zero, an open year compared
 * against closed ones, a missing document rendered as a dead link, an empty
 * table where a stated cause belongs, and a CSV that disagrees with the screen.
 * The worked example is Chalakudy Municipality 2023-24, whose figures are the
 * master database's own.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancesSection from "../FinancesSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { server } from "@/test/setup";
import { detailedHandlers } from "@/test/handlers.finances";
import { CSV_COLUMNS } from "@/components/finances/format";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/finances/:lb?/:year?" element={<FinancesSection />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The figures block, once the endpoint has answered. */
async function figures() {
  return screen.findByRole("region", { name: /^Chalakudy Municipality, 2023–24$/ });
}

beforeEach(() => {
  resetBodiesCache();
  // The full payload the endpoint returns. The default handler answers this
  // one body-year with the bare contract object harness.test.tsx compares to.
  server.use(...detailedHandlers);
});

afterEach(() => {
  // The document base is set by one test only; without this it would leak into
  // the next and turn a stated absence into a link.
  vi.unstubAllEnvs();
});

describe("a body-year", () => {
  it("renders the project count, formulation, expense and the share spent", async () => {
    renderAt("/finances/M08032/2023-2024");
    const block = await figures();

    expect(within(block).getByText("357")).toBeInTheDocument();
    expect(within(block).getByText("₹23.88 crore")).toBeInTheDocument();
    expect(within(block).getByText("₹11.69 crore")).toBeInTheDocument();
    expect(within(block).getByText("49.0%")).toBeInTheDocument();
    // The exact rupee figure sits under the rounded one.
    expect(within(block).getByText("₹23,88,06,688")).toBeInTheDocument();
    expect(within(block).getByText("₹11,69,13,203")).toBeInTheDocument();
  });

  it("states the carried and first-seen counts, and lists the carried projects", async () => {
    const user = userEvent.setup();
    renderAt("/finances/M08032/2023-2024");
    await figures();

    const panel = await screen.findByRole("region", { name: /Projects carried from 2022–23/ });
    expect(within(panel).getByText(/140 of 354 distinct project names/)).toBeInTheDocument();
    expect(within(panel).getByText(/214 are seen for the first time/)).toBeInTheDocument();

    // The lists are derived from the previous year's rows and shown only once
    // they reproduce the published counts, so this waits for that fetch.
    const carried = within(panel).getByTestId("carried-projects");
    await user.click(within(carried).getByText(/Also in 2022–23: 140/));
    await waitFor(() => expect(within(carried).getAllByRole("listitem")).toHaveLength(140));
    expect(carried).toHaveAttribute("open");

    const fresh = within(panel).getByTestId("new-projects");
    expect(within(fresh).getAllByRole("listitem")).toHaveLength(214);
  });

  it("renders a SourceLine under every figure block", async () => {
    renderAt("/finances/M08032/2023-2024");
    await figures();

    // Series, figures, continuity, project table.
    await waitFor(() => expect(screen.getAllByTestId("source-line")).toHaveLength(4));
  });

  it("states that no sector classification is published", async () => {
    renderAt("/finances/M08032/2023-2024");
    const note = await screen.findByTestId("classification-note");

    expect(
      within(note).getByText(/publishes no sector or category for a project/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sector breakdown/i)).not.toBeInTheDocument();
  });
});

describe("the fourteen-year series", () => {
  it("renders every year in order, with the years that hold no record as gaps", async () => {
    renderAt("/finances/G13064");

    const table = await screen.findByRole("table", {
      name: /Formulation and expense by financial year, Panoor Grama Panchayat/,
    });
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(14);
    expect(rows[0]).toHaveTextContent("2012–13");
    expect(rows[13]).toHaveTextContent("2025–26");

    // Panoor's plan record stops in 2014-15. The eleven years after it stay in
    // the series as gaps rather than being drawn as zero.
    expect(rows[2]).not.toHaveTextContent("No record");
    expect(rows[3]).toHaveTextContent("No record");
    expect(rows.filter((row) => row.textContent?.includes("No record"))).toHaveLength(11);
  });

  it("marks the open year and leaves the closed years unmarked", async () => {
    renderAt("/finances/M08032");

    const table = await screen.findByRole("table", { name: /by financial year/ });
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows[13]).toHaveTextContent("2025–26 (year in progress)");
    expect(rows[12]).toHaveTextContent("2024–25");
    expect(rows[12]).not.toHaveTextContent("in progress");
  });

  it("labels the open year on the year's own figures", async () => {
    renderAt("/finances/M08032/2025-2026");

    expect(
      await screen.findByRole("region", { name: /^Chalakudy Municipality, 2025–26 \(year in progress\)$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/is still open/)).toBeInTheDocument();
  });

  it("leaves a closed year without the in-progress label", async () => {
    renderAt("/finances/M08032/2023-2024");
    const block = await figures();

    expect(block).not.toHaveTextContent("in progress");
  });
});

describe("the project table", () => {
  it("renders a project with no document without a link and without an error", async () => {
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    // 351 of the 357 have a document; the other six still appear.
    expect(within(table).getAllByText("None")).toHaveLength(6);
    expect(within(table).getAllByText("Held, not linkable")).toHaveLength(351);
    expect(within(table).queryAllByRole("link")).toHaveLength(0);
    expect(
      screen.getByText(/351 of 357 projects have a scanned document/),
    ).toBeInTheDocument();
  });

  it("links the document where an address for the bucket is configured", async () => {
    vi.stubEnv("VITE_PROJECT_PDF_BASE", "https://documents.example/sulekha");
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    const links = within(table).getAllByRole("link", { name: "PDF" });
    expect(links).toHaveLength(351);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://documents.example/sulekha/pdfs/2023-2024/Municipality/Thrissur/Chalakudy_Municipality/1.pdf",
    );
    // The six with no document keep their stated absence.
    expect(within(table).getAllByText("None")).toHaveLength(6);
  });

  it("renders every row with exact, unrounded figures", async () => {
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(357);
    expect(rows[0]).toHaveTextContent("₹6,68,926");
  });

  it("offers a CSV of exactly the rows on screen", async () => {
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");
    const link = screen.getByTestId("download-csv");

    expect(link).toHaveAttribute("download", "finances_M08032_2023-2024.csv");

    const csv = decodeURIComponent(
      (link.getAttribute("href") ?? "").replace(/^data:text\/csv;charset=utf-8,/, ""),
    );
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(358);

    const screenRows = within(table).getAllByRole("row").slice(1);
    const unformat = (text: string) => text.replace(/[₹,]/g, "");

    screenRows.forEach((row, index) => {
      const cells = within(row).getAllByRole("cell");
      const csvCells = lines[index + 1].split(",");
      expect(csvCells[0]).toBe(cells[0].textContent);
      expect(csvCells[2]).toBe(unformat(cells[2].textContent ?? ""));
      expect(csvCells[3]).toBe(unformat(cells[3].textContent ?? ""));
    });

    // Nothing in the file is rounded: the column sums to the figure on screen.
    const formulation = lines
      .slice(1)
      .reduce((total, line) => total + Number(line.split(",")[2]), 0);
    expect(formulation).toBe(238806688);
  });
});

describe("a body-year with no record", () => {
  it("states the cause instead of rendering an empty table", async () => {
    renderAt("/finances/G13064/2023-2024");

    expect(
      await screen.findByText(/Sulekha records no projects for 2023-2024/),
    ).toBeInTheDocument();
    expect(screen.getByText(/plan record runs from 2012-2013 to 2014-2015/)).toBeInTheDocument();
    expect(screen.queryByTestId("project-table")).not.toBeInTheDocument();
  });
});
