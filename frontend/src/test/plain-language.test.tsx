/**
 * The words that describe the system, kept off the screen.
 *
 * `docs/instructions.md` section 0 names them. The reader is a resident, a
 * journalist or a councillor: they have not used Sulekha or Sakarma, and a
 * sentence about a key, a manifest or a payload tells them nothing they came
 * for. The list shipped once anyway, which is why this file exists.
 *
 * It renders the real pages against the real fixtures and reads the text a
 * browser would show. A word that only appears in a comment, a prop name or a
 * class is not a failure; a word a reader can see is.
 */

import { render, screen, waitFor, waitForElementToBeRemoved } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import ElectionsSection from "@/sections/ElectionsSection";
import FinancesSection from "@/sections/FinancesSection";
import { detailedHandlers } from "./handlers.finances";
import HomeSection from "@/sections/HomeSection";
import MeetingsSection from "@/sections/MeetingsSection";
import MethodSection from "@/sections/MethodSection";
import Masthead from "@/components/shell/Masthead";
import SiteFooter from "@/components/shell/SiteFooter";
import { resetBodiesCache } from "@/hooks/useBodies";
import { server } from "@/test/setup";
import { handlers as methodHandlers } from "@/test/handlers.method";

/**
 * Reader-facing copy must not leak the vocabulary of the database underneath
 * it. This list is the test's own -- docs/instructions.md governs voice and
 * has no vocabulary section, so nothing here is quoting it.
 *
 * `record`, `row` and `join` are left out on purpose. Each is banned only
 * where a plainer word exists, which is a judgement a regular expression
 * cannot make: "What happens if we join the records?" is the site's central
 * question in ordinary English and is the client's own heading. `joined on`
 * stays, because that one is only ever SQL.
 */
const BANNED = [
  "key",
  "identifier",
  "lb_code",
  "payload",
  "schema",
  "manifest",
  "joined on",
  "crosswalk",
  "rollup",
  "ingest",
  "corpus",
  "endpoint",
  "pipeline",
  "provenance",
  "metadata",
  "dataset",
  "null",
];

/** Every banned word this page shows, with the sentence it sits in. */
function offences(text: string): string[] {
  const found: string[] = [];
  for (const word of BANNED) {
    const match = new RegExp(`[^.]*\\b${word}\\b[^.]*`, "i").exec(text);
    if (match) found.push(`${word}: "${match[0].trim()}"`);
  }
  return found;
}

function readable(): string {
  return document.body.textContent ?? "";
}

function renderAt(path: string, element: React.ReactElement, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetBodiesCache();
});

describe("the words a reader is never shown", () => {
  it("keeps them off the home page", async () => {
    render(
      <MemoryRouter>
        <HomeSection />
      </MemoryRouter>,
    );
    // This used to wait on a coverage table the adopted copy dropped, so it
    // waits on the Amboori example instead --
    // and specifically on its loading line going away, which is the only
    // signal that means "settled" whether the figures arrived or the notice
    // did. Both are copy this test is here to read.
    await waitForElementToBeRemoved(() => screen.queryByText(/^Reading Amboori/i));

    expect(offences(readable())).toEqual([]);
  });

  it("keeps them off the masthead, the tabs and the footer", () => {
    // The tabs moved inside the masthead in the nameplate redesign, so one
    // render now covers both.
    render(
      <MemoryRouter>
        <Masthead />
        <SiteFooter />
      </MemoryRouter>,
    );

    expect(offences(readable())).toEqual([]);
  });

  it("keeps them off a body-year of meetings", async () => {
    renderAt("/meetings/M08032/2023-2024", <MeetingsSection />, "/meetings/:lb?/:year?");
    await screen.findByTestId("meetings-total");

    expect(offences(readable())).toEqual([]);
  });

  it("keeps them off a body-year of finances", async () => {
    server.use(...detailedHandlers);
    renderAt("/finances/M08032/2023-2024", <FinancesSection />, "/finances/:lb?/:year?");
    await screen.findByTestId("project-table");

    expect(offences(readable())).toEqual([]);
  });

  it("keeps them off a body-cycle of election results", async () => {
    renderAt("/elections/M08032/2025", <ElectionsSection />, "/elections/:lb?/:cycle?");
    await screen.findByRole("heading", { name: /Ward results/ });

    expect(offences(readable())).toEqual([]);
  });

  it("keeps them off the method page", async () => {
    server.use(...methodHandlers);
    render(
      <MemoryRouter>
        <MethodSection />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "The build" })).toBeInTheDocument(),
    );

    expect(offences(readable())).toEqual([]);
  });
});
