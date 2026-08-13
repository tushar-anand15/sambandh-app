/**
 * What the assistant says it holds, and what it lets a reader ask about.
 *
 * The rest of the site covers every local body in Kerala. The assistant covers
 * nineteen. The gap between those two numbers is where a confident wrong answer
 * comes from, so both the banner and the dropdown are counted off the corpus
 * rather than written down, and these tests hold that: change the fixture and
 * the rendered figures move with it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import CoverageBanner, {
  useAssistantIndex,
  type AssistantIndex,
} from "../CoverageBanner";
import ScopeSelector, { scopedQuestion } from "../ScopeSelector";
import { server } from "@/test/setup";

/** Three of the nineteen. The count is what matters, not the names. */
const INDEX: AssistantIndex = {
  districts: ["Thrissur"],
  years: ["2025-2026"],
  documents: 1055,
  local_bodies: [
    {
      lb_name: "Adat Grama Panchayat",
      lb_type: "Grama Panchayat",
      district_name: "Thrissur",
      documents: 41,
    },
    {
      lb_name: "Athirappilly Grama Panchayat",
      lb_type: "Grama Panchayat",
      district_name: "Thrissur",
      documents: 33,
    },
    {
      lb_name: "Chalakkudy Municipality",
      lb_type: "Municipality",
      district_name: "Thrissur",
      documents: 61,
    },
  ],
};

function serveIndex(index: AssistantIndex = INDEX) {
  server.use(http.get("*/api/documents/filters", () => HttpResponse.json(index)));
}

/** The banner reads the index itself, so the harness has to mount the hook. */
function Banner() {
  return <CoverageBanner state={useAssistantIndex()} />;
}

describe("the coverage banner", () => {
  it("states the index before the first question", async () => {
    serveIndex();
    render(<Banner />);

    expect(
      await screen.findByText(
        /has read 1,055 project documents from 3 local bodies in Thrissur district, for 2025–26 only/,
      ),
    ).toBeInTheDocument();
  });

  it("says it declines anything outside that", async () => {
    serveIndex();
    render(<Banner />);

    expect(
      await screen.findByText(/declines questions about any other local body or year/),
    ).toBeInTheDocument();
  });

  it("points at the sections that do cover every local body", async () => {
    serveIndex();
    render(<Banner />);

    expect(
      await screen.findByText(/cover every local body in Kerala, and need no account/),
    ).toBeInTheDocument();
  });

  it("moves when the ingest moves", async () => {
    serveIndex({
      ...INDEX,
      documents: 2110,
      local_bodies: [...INDEX.local_bodies, ...INDEX.local_bodies].map((body, i) => ({
        ...body,
        lb_name: `${body.lb_name} ${i}`,
      })),
    });
    render(<Banner />);

    expect(
      await screen.findByText(/has read 2,110 project documents from 6 local bodies/),
    ).toBeInTheDocument();
  });

  it("names the scope it can still be trusted for when the count fails to load", async () => {
    server.use(
      http.get("*/api/documents/filters", () =>
        HttpResponse.json({ detail: "no" }, { status: 500 }),
      ),
    );
    render(<Banner />);

    expect(
      await screen.findByText(/Ask about Thrissur district for 2025–26 only/),
    ).toBeInTheDocument();
  });
});

describe("the body selector", () => {
  it("lists exactly the indexed bodies and nothing else", () => {
    render(
      <ScopeSelector bodies={INDEX.local_bodies} value="" onChange={() => {}} />,
    );

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(options).toEqual([
      "Any indexed local body",
      "Adat Grama Panchayat (41 documents)",
      "Athirappilly Grama Panchayat (33 documents)",
      "Chalakkudy Municipality (61 documents)",
    ]);
  });

  it("offers nothing to choose when the index is empty", () => {
    render(<ScopeSelector bodies={[]} value="" onChange={() => {}} />);

    // Disabled rather than empty: an enabled dropdown with one option reads as
    // a list still loading.
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("reports the chosen body by name", async () => {
    const chosen: string[] = [];
    render(
      <ScopeSelector
        bodies={INDEX.local_bodies}
        value=""
        onChange={(name) => chosen.push(name)}
      />,
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "Chalakkudy Municipality",
    );
    expect(chosen).toEqual(["Chalakkudy Municipality"]);
  });

  it("carries the chosen body into the question that is sent", () => {
    expect(scopedQuestion("Chalakkudy Municipality", "how many road projects?")).toBe(
      "In Chalakkudy Municipality: how many road projects?",
    );
    // No body chosen leaves the question exactly as it was typed.
    expect(scopedQuestion("", "how many road projects?")).toBe(
      "how many road projects?",
    );
  });
});
