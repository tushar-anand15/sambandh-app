/**
 * The selection contract.
 *
 * Two claims are worth a test here and they are the two the rest of the site
 * rests on: that three interactions produce a URL, and that the same URL
 * reproduces the three selections. Everything else on this page — figures,
 * tables, maps — is downstream of a body and a period, so if those two hold,
 * a link to any view on the site is a citation.
 *
 * The third claim is about honesty rather than mechanics: a body a section has
 * no record of says so, and names who published nothing.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import BodySelector from "../BodySelector";
import { resetBodiesCache } from "@/hooks/useBodies";
import { server } from "@/test/setup";

/** The address bar, as a testable node. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.pathname}</p>;
}

/** The same three routes App.tsx declares, so paths are exercised, not mocked. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/finances/:lb?/:year?"
          element={
            <>
              <BodySelector section="finances" />
              <Address />
            </>
          }
        />
        <Route
          path="/meetings/:lb?/:year?"
          element={
            <>
              <BodySelector section="meetings" />
              <Address />
            </>
          }
        />
        <Route
          path="/elections/:lb?/:cycle?"
          element={
            <>
              <BodySelector section="elections" />
              <Address />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const district = () => screen.getByLabelText("District");
const body = () => screen.getByLabelText("Local body");
const address = () => screen.getByTestId("address");

/** Resolves once /api/bodies has answered and the controls are live. */
async function selectorReady() {
  return screen.findByLabelText("District");
}

beforeEach(() => {
  // The hook caches the list for the life of the tab; each test is a new tab.
  resetBodiesCache();
});

describe("BodySelector", () => {
  it("filters the body list to the chosen district", async () => {
    renderAt("/finances");
    await selectorReady();

    await userEvent.selectOptions(district(), "KANNUR");

    const options = within(body())
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Choose a local body",
      "Mattannur — Municipality",
      "Panoor — Grama Panchayat",
    ]);
    // Chalakudy is in Thrissur and must not survive the filter.
    expect(options.join(" ")).not.toContain("Chalakudy");
  });

  it("reaches a view in three interactions, and says so in the URL", async () => {
    renderAt("/finances");
    await selectorReady();

    await userEvent.selectOptions(district(), "THRISSUR");
    await userEvent.selectOptions(body(), "M08032");
    await userEvent.selectOptions(screen.getByLabelText("Financial year"), "2023-2024");

    expect(address()).toHaveTextContent("/finances/M08032/2023-2024");
  });

  it("restores all three selections from a pasted URL, with no interaction", async () => {
    renderAt("/finances/M08032/2023-2024");
    await selectorReady();

    expect(district()).toHaveValue("THRISSUR");
    expect(body()).toHaveValue("M08032");
    expect(screen.getByLabelText("Financial year")).toHaveValue("2023-2024");
  });

  it("labels the open financial year as in progress", async () => {
    renderAt("/finances/M08032");
    await selectorReady();

    const years = within(screen.getByLabelText("Financial year")).getAllByRole("option");
    expect(years.map((y) => y.textContent)).toContain("2025–26 (in progress)");
    expect(years.map((y) => y.textContent)).toContain("2023–24");
  });

  it("offers election cycles, not financial years, under Elections", async () => {
    renderAt("/elections/M08032");
    await selectorReady();

    const cycles = within(screen.getByLabelText("Election cycle")).getAllByRole(
      "option",
    );
    expect(cycles.map((c) => c.textContent)).toEqual([
      "Choose a cycle",
      "2010",
      "2015",
      "2020",
      "2025",
    ]);
  });

  it("shows a section a body has no record in as unavailable, with its reason", async () => {
    // Panoor: Sakarma holds nothing for it. Dropping Meetings from the list
    // would read as "this panchayat held no meetings", which is a different
    // and false claim.
    renderAt("/finances/G13064");
    await selectorReady();

    const meetings = screen.getByText("Meetings — unavailable");
    expect(meetings).toBeInTheDocument();
    expect(
      screen.getByText("Sakarma publishes no meetings for this local body."),
    ).toBeInTheDocument();
    // The sections it does have stay as links.
    expect(screen.getByRole("link", { name: "Elections" })).toHaveAttribute(
      "href",
      "/elections/G13064",
    );
  });

  it("states the reason on the section the body is missing, not only in the list", async () => {
    renderAt("/meetings/G13064");
    await selectorReady();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sakarma publishes no meetings for this local body.",
    );
  });

  it("names an unknown lb_code rather than rendering a blank page", async () => {
    renderAt("/finances/M99999");
    await selectorReady();

    const message = await screen.findByRole("alert");
    expect(message).toHaveTextContent("M99999");
    // And the visitor can still get somewhere from here.
    expect(district()).toBeInTheDocument();
  });

  it("clears the body when the district changes under it", async () => {
    renderAt("/finances/M08032/2023-2024");
    await selectorReady();

    await userEvent.selectOptions(district(), "KANNUR");

    // The address must stop describing a view nobody is looking at.
    expect(address().textContent).toBe("/finances");
    expect(body()).toHaveValue("");
    expect(district()).toHaveValue("KANNUR");
  });

  it("keeps the chosen year when the body changes", async () => {
    renderAt("/finances/M13057/2023-2024");
    await selectorReady();

    await userEvent.selectOptions(body(), "G13064");

    // The year is not a property of the body, so re-picking it would be an
    // interaction that bought the reader nothing.
    expect(address().textContent).toBe("/finances/G13064/2023-2024");
  });

  it("reads /api/bodies once however many selectors mount", async () => {
    // 1,238 rows of identity and coverage flags, shared by three sections. A
    // visitor moving between them should pay for the list once.
    let requests = 0;
    const count = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === "/api/bodies") requests += 1;
    };
    server.events.on("request:start", count);

    try {
      renderAt("/finances");
      await selectorReady();

      renderAt("/meetings");
      // Six controls: three in each selector, the second resolving from cache.
      await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(6));

      expect(requests).toBe(1);
    } finally {
      server.events.removeListener("request:start", count);
    }
  });
});
