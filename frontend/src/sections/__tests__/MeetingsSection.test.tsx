/**
 * What the Meetings page has to get right.
 *
 * Two of these tests are about arithmetic — the total, the two splits, and the
 * rows they were counted from. The rest are about the difference between four
 * answers that all look like "nothing here": a code that matches no local body,
 * a body Sakarma does not cover, a covered body in a year it holds nothing for,
 * and a year with one meeting in it. A page that renders any of them as an
 * empty table publishes a claim the register does not make.
 */

import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import MeetingsSection from "../MeetingsSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { chalakudyMeetings } from "@/test/handlers";
import { chalakudyMeetingRows, meetingsYear } from "@/test/handlers.meetings";
import { server } from "@/test/setup";

const API = "http://localhost/api";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings/:lb?/:year?" element={<MeetingsSection />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The counts block, once it has loaded. */
async function counts() {
  return (await screen.findByRole("heading", { name: /Meetings recorded, Chalakudy/ }))
    .closest("section")!;
}

beforeEach(() => {
  resetBodiesCache();
});

describe("a body-year with meetings", () => {
  it("shows the total and both splits of it", async () => {
    renderAt("/meetings/M08032/2023-2024");

    expect(await screen.findByTestId("meetings-total")).toHaveTextContent("64");

    const block = await counts();
    // By category, then by nature. Both add to 64, and both say so.
    expect(within(block).getByText("18 of 64 (28.1%)")).toBeInTheDocument();
    expect(within(block).getByText("46 of 64 (71.9%)")).toBeInTheDocument();
    expect(within(block).getByText("31 of 64 (48.4%)")).toBeInTheDocument();
    expect(within(block).getByText("33 of 64 (51.6%)")).toBeInTheDocument();
  });

  it("names the register's own Malayalam terms beside the English", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const block = await counts();

    expect(within(block).getAllByText(/ഭരണസമിതി യോഗം/).length).toBeGreaterThan(0);
    expect(within(block).getAllByText(/സാധാരണ യോഗം/).length).toBeGreaterThan(0);
  });

  it("renders date, category, nature and venue for every meeting", async () => {
    renderAt("/meetings/M08032/2023-2024");

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    // One header row, then one row per meeting.
    expect(rows).toHaveLength(chalakudyMeetings.meetings + 1);

    const first = within(rows[1]).getAllByRole("cell");
    expect(first[0]).toHaveTextContent("12 October 2023");
    expect(first[1]).toHaveTextContent("ഭരണസമിതി യോഗം");
    expect(first[1]).toHaveTextContent("Governing body");
    expect(first[2]).toHaveTextContent("അടിയന്തിര യോഗം/പ്രത്യേക യോഗം");
    expect(first[2]).toHaveTextContent("Special");
    expect(first[3]).toHaveTextContent("മുനിസിപ്പൽ കൌൺസിൽ ഹാള്‍");
  });

  it("bounds the list with the first and last meeting of the year", async () => {
    renderAt("/meetings/M08032/2023-2024");

    expect(
      await screen.findByText("64 meetings, 12 October 2023 to 27 March 2024."),
    ).toBeInTheDocument();
  });

  it("says what the section serves and what it does not", async () => {
    renderAt("/meetings/M08032/2023-2024");

    expect(await screen.findByTestId("scope-note")).toHaveTextContent(
      "Sakarma publishes a decision register and minutes for 420,561 of the 443,235 meetings in the manifest.",
    );
    expect(screen.getByTestId("scope-note")).toHaveTextContent(
      /attachments are named in the manifest and are not served here/,
    );
  });

  it("carries a source line under every block of figures", async () => {
    renderAt("/meetings/M08032/2023-2024");
    await screen.findByRole("table");

    const lines = screen.getAllByTestId("source-line");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toHaveTextContent("Gram Sambandh master database");
      expect(line).toHaveTextContent("Sakarma meeting manifest");
      expect(line).toHaveTextContent("13 August 2026");
    }
  });
});

describe("the figures on screen and the figures in the payload", () => {
  it("are the same numbers", async () => {
    const payload = await (await fetch(`${API}/meetings/M08032/2023-2024`)).json();

    renderAt("/meetings/M08032/2023-2024");
    const block = await counts();

    expect(await screen.findByTestId("meetings-total")).toHaveTextContent(
      String(payload.meetings),
    );
    expect(
      within(block).getByText(new RegExp(`^${payload.governing_body} of ${payload.meetings} `)),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(
        new RegExp(`^${payload.standing_committee} of ${payload.meetings} `),
      ),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(new RegExp(`^${payload.ordinary} of ${payload.meetings} `)),
    ).toBeInTheDocument();
    expect(
      within(block).getByText(new RegExp(`^${payload.special} of ${payload.meetings} `)),
    ).toBeInTheDocument();

    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(payload.meeting_rows.length + 1);
  });

  it("match the shared fixture the backend tests quote", async () => {
    const payload = await (await fetch(`${API}/meetings/M08032/2023-2024`)).json();

    // Counted from the 64 rows, so a wrong row would move a count.
    expect(payload.meetings).toBe(chalakudyMeetings.meetings);
    expect(payload.governing_body).toBe(chalakudyMeetings.governing_body);
    expect(payload.standing_committee).toBe(chalakudyMeetings.standing_committee);
    expect(payload.ordinary).toBe(chalakudyMeetings.ordinary);
    expect(payload.special).toBe(chalakudyMeetings.special);
    expect(payload.first_meeting).toBe(chalakudyMeetings.first_meeting);
    expect(payload.last_meeting).toBe(chalakudyMeetings.last_meeting);
  });
});

describe("a year the portal holds no record for", () => {
  it("says so, and does not say the council held no meetings", async () => {
    // Aluva is covered. Sakarma's record for it starts in 2023-24.
    renderAt("/meetings/M07025/2016-2017");

    const reason = await screen.findByTestId("unavailable-reason");
    // One sentence. The year control does not offer 2016-17 for this body, so
    // the three paragraphs this page used to print have nothing left to argue.
    expect(reason).toHaveTextContent("Sakarma holds no meeting record for 2016–17.");
    expect(reason.textContent!.split(".").filter((p) => p.trim()).length).toBe(1);

    // Nothing that could be read as a count of meetings held.
    expect(screen.queryByTestId("meetings-total")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("does not restate the coverage argument the year control now settles", async () => {
    renderAt("/meetings/M07025/2016-2017");

    await screen.findByTestId("unavailable-reason");
    expect(screen.queryByTestId("coverage-note")).not.toBeInTheDocument();
  });
});

describe("a thin early year", () => {
  it("shows the one meeting recorded, with the note about coverage", async () => {
    // Muttar's record starts in 2015-16, the earliest year in the corpus.
    renderAt("/meetings/G04036/2015-2016");

    expect(await screen.findByTestId("meetings-total")).toHaveTextContent("1");
    expect(screen.getByTestId("coverage-note")).toHaveTextContent(
      /A year with few meetings in it is a thin record/,
    );
  });
});

describe("a meeting the register left fields out of", () => {
  it("names the absence instead of leaving the cell empty", async () => {
    const rows = chalakudyMeetingRows.map((row, index) =>
      index === 0 ? { ...row, venue: null, meeting_no: null } : row,
    );
    server.use(
      http.get("*/api/meetings/:lb/:year", () =>
        HttpResponse.json(meetingsYear("M08032", "2023-2024", rows)),
      ),
    );
    renderAt("/meetings/M08032/2023-2024");

    const table = await screen.findByRole("table");
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell");

    expect(cells[3]).toHaveTextContent("Not recorded in the register");
    expect(cells[4]).toHaveTextContent("Not recorded in the register");
    // Every cell in the row says something.
    for (const cell of cells) expect(cell.textContent?.trim()).not.toBe("");
  });
});

describe("a body Sakarma does not cover", () => {
  it("states the reason rather than rendering an empty year", async () => {
    // Panoor: no Sakarma record at all, in any year.
    renderAt("/meetings/G13064/2023-2024");

    expect(await screen.findByTestId("unavailable-reason")).toHaveTextContent(
      "Sakarma holds no meeting record for this body.",
    );
    expect(
      screen.getByText(/covers 1,200 of Kerala’s 1,238 local bodies/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("source-line").length).toBeGreaterThan(0);
  });
});

describe("a code that matches no local body", () => {
  it("names the code and asks for nothing else", async () => {
    renderAt("/meetings/M99999/2023-2024");

    expect(
      await screen.findByText(/No local body has the code M99999, so there is no meeting/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("unavailable-reason")).not.toBeInTheDocument();
  });
});

describe("nothing selected yet", () => {
  it("asks for a district, a body and a year, and fetches nothing", async () => {
    renderAt("/meetings");

    expect(
      await screen.findByText(/Choose a district, a local body and a financial year/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("meetings-total")).not.toBeInTheDocument();
    // The scope note holds on every state of the page, not only where figures are.
    expect(screen.getByTestId("scope-note")).toBeInTheDocument();
  });
});
