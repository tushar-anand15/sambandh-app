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
import { beforeEach, describe, expect, it, vi } from "vitest";

import FinancesSection from "../FinancesSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { server } from "@/test/setup";
import {
  NO_SIGNING_KEY_REASON,
  detailedHandlers,
  unsignedHandlers,
} from "@/test/handlers.finances";
import { CSV_COLUMNS } from "@/components/finances/format";
import { PAGE_SIZE } from "@/components/finances/ProjectTable";

// pdf.js reaches for DOMMatrix, which jsdom does not implement. The rendered
// page is not assertable here; the address handed to the renderer is.
vi.mock("@/components/viewer/PdfPages", () => ({
  default: ({ url }: { url: string }) => <p data-testid="pdf-pages">{url}</p>,
}));

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

/** Clicks Next until the table is on its last page. */
async function lastPage() {
  const user = userEvent.setup();
  const next = screen.getByRole("button", { name: "Next" });
  while (!next.hasAttribute("disabled")) {
    await user.click(next);
  }
}

beforeEach(() => {
  resetBodiesCache();
  // The full payload the endpoint returns. The default handler answers this
  // one body-year with the bare contract object harness.test.tsx compares to.
  server.use(...detailedHandlers);
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

  it("carries no note about sector classification", async () => {
    renderAt("/finances/M08032/2023-2024");
    await figures();

    // The page draws no sector split, and it no longer explains that it does
    // not. Nothing is claimed, so nothing needs defending.
    expect(screen.queryByTestId("classification-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/sector/i)).not.toBeInTheDocument();
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

    // 351 of the 357 have a document, and the first page holds fifty rows, all
    // of them openable. The six without one sit on the last page.
    expect(within(table).getAllByText("View")).toHaveLength(PAGE_SIZE);
    expect(
      screen.getByText(/351 of 357 projects have a scanned document/),
    ).toBeInTheDocument();

    await lastPage();
    expect(within(table).getAllByText("None")).toHaveLength(6);
  });

  it("pages through the year fifty rows at a time", async () => {
    const user = userEvent.setup();
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(PAGE_SIZE);
    expect(screen.getByTestId("page-position")).toHaveTextContent(
      "Rows 1 to 50 of 357",
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("page-position")).toHaveTextContent(
      "Rows 51 to 100 of 357",
    );
    expect(within(table).getAllByRole("row")[1]).toHaveAttribute(
      "data-project-no",
      "51",
    );

    await lastPage();
    // 357 rows is seven pages of fifty and a last page of seven.
    expect(screen.getByTestId("page-position")).toHaveTextContent(
      "Rows 351 to 357 of 357",
    );
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("renders every row with exact, unrounded figures", async () => {
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");
    const rows = within(table).getAllByRole("row").slice(1);

    expect(rows).toHaveLength(PAGE_SIZE);
    expect(rows[0]).toHaveTextContent("₹6,68,926");
  });

  it("offers a CSV of the whole year, not of the page on screen", async () => {
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

  it("keeps the expiring signed URL out of the CSV", async () => {
    renderAt("/finances/M08032/2023-2024");
    await screen.findByTestId("project-table");

    const csv = decodeURIComponent(
      (screen.getByTestId("download-csv").getAttribute("href") ?? "").replace(
        /^data:text\/csv;charset=utf-8,/,
        "",
      ),
    );

    // The file holds the stable object path. A signed URL in a downloaded file
    // would be dead within the hour.
    expect(csv).toContain("pdfs/2023-2024/Municipality/Thrissur");
    expect(csv).not.toContain("X-Goog-Signature");
  });
});

describe("the document drawer", () => {
  it("opens the project's document when its row is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    expect(screen.queryByTestId("pdf-drawer")).not.toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: "പദ്ധതി 1" }));

    const drawer = await screen.findByTestId("pdf-drawer");
    expect(within(drawer).getByRole("heading", { name: "പദ്ധതി 1" })).toBeInTheDocument();
    expect(
      within(drawer).getByText("Project 1, Chalakudy Municipality, 2023–24"),
    ).toBeInTheDocument();

    expect(await within(drawer).findByTestId("pdf-pages")).toHaveTextContent(
      "X-Goog-Signature",
    );

    const link = within(drawer).getByRole("link", {
      name: "Open the document in a new tab",
    });
    expect(link.getAttribute("href")).toContain(
      "storage.googleapis.com/sulekhasakarma-pdfs/pdfs/2023-2024/Municipality/Thrissur/Chalakudy_Municipality/1.pdf",
    );
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    await user.click(within(table).getByRole("button", { name: "പദ്ധതി 1" }));
    await screen.findByTestId("pdf-drawer");

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByTestId("pdf-drawer")).not.toBeInTheDocument(),
    );
  });

  it("states why there is no address where the deployment cannot sign one", async () => {
    const user = userEvent.setup();
    server.use(...unsignedHandlers);
    renderAt("/finances/M08032/2023-2024");
    const table = await screen.findByTestId("project-table");

    // Every row keeps its stated absence, and the cause is given once above.
    expect(within(table).getAllByText("Held, no address")).toHaveLength(PAGE_SIZE);
    expect(within(table).queryAllByText("View")).toHaveLength(0);
    expect(screen.getByText(new RegExp(NO_SIGNING_KEY_REASON.slice(0, 60)))).toBeInTheDocument();

    // A row with no address cannot be opened.
    await user.click(within(table).getAllByRole("row")[1]);
    expect(screen.queryByTestId("pdf-drawer")).not.toBeInTheDocument();
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
