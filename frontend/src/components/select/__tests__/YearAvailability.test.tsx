/**
 * A year the selected body has no record for is not a year to offer.
 *
 * The page this replaces let a visitor pick Aluva Municipality and 2016-17,
 * then answered with three paragraphs about why there was nothing there. The
 * three paragraphs were the cost of the control: `/api/bodies` carried a count
 * of years, which cannot say which ones, so the control offered all fourteen
 * and the page argued afterwards.
 *
 * `/api/bodies` now names the years. These tests are about the control reading
 * them, and about the fallback that keeps the old behaviour when a payload has
 * no list rather than showing a reader an empty dropdown.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import BodySelector from "../BodySelector";
import { resetBodiesCache } from "@/hooks/useBodies";
import { bodiesWithYears } from "@/test/handlers.meetings";
import { server } from "@/test/setup";

function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/meetings/:lb?/:year?"
          element={
            <>
              <BodySelector section="meetings" />
              <Address />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const yearControl = () => screen.getByLabelText("Financial year");

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("District")).toBeInTheDocument());
}

/** Every option, as the reader sees it, paired with whether it can be chosen. */
function years() {
  return within(yearControl())
    .getAllByRole("option")
    .map((option) => [option.textContent, (option as HTMLOptionElement).disabled] as const);
}

beforeEach(() => {
  resetBodiesCache();
  server.use(bodiesWithYears);
});

describe("the year control under a chosen body", () => {
  it("offers the years that body has a record for", async () => {
    // Aluva's meeting record runs 2023-24 to 2025-26.
    renderAt("/meetings/M07025");
    await ready();

    const choosable = years()
      .filter(([, disabled]) => !disabled)
      .map(([label]) => label);
    expect(choosable).toEqual([
      "Choose a year",
      "2023–24",
      "2024–25",
      "2025–26 (in progress)",
    ]);
  });

  it("keeps the years it has none for in the list, labelled and unchoosable", async () => {
    renderAt("/meetings/M07025");
    await ready();

    expect(years()).toContainEqual(["2016–17 (no record)", true]);
    expect(years()).toContainEqual(["2015–16 (no record)", true]);
    // All fourteen years are still visible: a reader can see that 2015-16
    // exists and that Sakarma holds nothing for this body in it.
    expect(years()).toHaveLength(15);
  });

  it("offers a different set for a body whose record starts earlier", async () => {
    // Muttar's record starts in 2015-16, the earliest year in the corpus.
    renderAt("/meetings/G04036");
    await ready();

    const choosable = years()
      .filter(([, disabled]) => !disabled)
      .map(([label]) => label);
    expect(choosable).toEqual(["Choose a year", "2015–16", "2023–24"]);
  });

  it("offers no year at all for a body the portal has no record of", async () => {
    // Panoor. The control is not empty — the years are all there, and every
    // one of them says the record is missing.
    renderAt("/meetings/G13064");
    await ready();

    expect(years().filter(([, disabled]) => !disabled).map(([l]) => l)).toEqual([
      "Choose a year",
    ]);
  });

  it("offers every year again when no body is chosen", async () => {
    renderAt("/meetings");
    await ready();

    expect(years().every(([, disabled]) => !disabled)).toBe(true);
  });

  it("offers every year when the payload carries no list", async () => {
    // The shared handler predates the year lists. A missing list must not
    // become an empty control.
    server.resetHandlers();
    renderAt("/meetings/M07025");
    await ready();

    expect(years().every(([, disabled]) => !disabled)).toBe(true);
  });

  it("still reaches a view in three interactions", async () => {
    renderAt("/meetings");
    await ready();

    await userEvent.selectOptions(screen.getByLabelText("District"), "ERNAKULAM");
    await userEvent.selectOptions(screen.getByLabelText("Local body"), "M07025");
    await userEvent.selectOptions(yearControl(), "2023-2024");

    expect(screen.getByTestId("address")).toHaveTextContent("/meetings/M07025/2023-2024");
  });

  it("keeps a year in the URL that the body has no record for", async () => {
    // A pasted link. The control shows what was asked for, disabled, and the
    // page below states the absence in one sentence.
    renderAt("/meetings/M07025/2016-2017");
    await ready();

    expect(yearControl()).toHaveValue("2016-2017");
  });
});
