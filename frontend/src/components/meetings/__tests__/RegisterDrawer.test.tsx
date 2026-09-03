/**
 * Reading what a council decided, from the meeting list.
 *
 * The page below the counts used to end at a table of dates and venues. Each
 * row now opens the document Sakarma published for that meeting, so these tests
 * are about the path from a row to the text: the button exists only where a
 * document does, opening one fetches it once, and the fragment the API returns
 * lands on the page as markup rather than as escaped source.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import MeetingsSection from "@/sections/MeetingsSection";
import { resetBodiesCache } from "@/hooks/useBodies";
import { resetRegisterCache } from "../useRegister";
import {
  chalakudyMeetingRows,
  REGISTER_HTML,
  registerMissing,
} from "@/test/handlers.meetings";
import { server } from "@/test/setup";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meetings/:lb?/:year?" element={<MeetingsSection />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The nth data row of the meeting list, once the table has loaded. */
async function row(n: number) {
  const table = await screen.findByRole("table");
  return within(table).getAllByRole("row")[n];
}

beforeEach(() => {
  resetBodiesCache();
  resetRegisterCache();
});

describe("the way into a meeting's own document", () => {
  it("offers the register and the minutes on a meeting that published both", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);

    expect(
      within(first).getByRole("button", { name: "Read the decision register" }),
    ).toBeInTheDocument();
    expect(
      within(first).getByRole("button", { name: "Read the minutes" }),
    ).toBeInTheDocument();
  });

  it("names the absence on a meeting that published neither", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const last = await row(chalakudyMeetingRows.length);

    expect(within(last).getByText("No document available")).toBeInTheDocument();
    expect(within(last).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the panel", () => {
  it("shows the document as markup, not as escaped source", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);
    await userEvent.click(
      within(first).getByRole("button", { name: "Read the decision register" }),
    );

    const document_ = await screen.findByTestId("register-html");
    // The fragment is a table of decisions and arrives as one.
    expect(within(document_).getByRole("table")).toBeInTheDocument();
    expect(document_).toHaveTextContent("Tender awarded at 88,500 rupees.");
    expect(document_.textContent).not.toContain("<table>");
    // The register's own column spans survive, because the API keeps colspan
    // and rowspan and drops every other attribute.
    expect(within(document_).getAllByRole("cell")[2]).toHaveAttribute("colspan", "2");
    expect(REGISTER_HTML).toContain("colspan=");
  });

  it("names the document and the meeting it belongs to", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);
    await userEvent.click(
      within(first).getByRole("button", { name: "Read the decision register" }),
    );

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("heading")).toHaveTextContent("Decision register");
    expect(panel).toHaveTextContent("12 October 2023, meeting 2");
    expect(panel).toHaveTextContent("Chalakudy Municipality");
    // The provenance line is gone from every panel; the Method page carries it.
    expect(within(panel).queryByTestId("source-line")).not.toBeInTheDocument();
  });

  it("closes on the button and on Escape, leaving the list behind it", async () => {
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);
    const open = within(first).getByRole("button", {
      name: "Read the decision register",
    });

    await userEvent.click(open);
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();

    await userEvent.click(open);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("reads one document once, however many times it is opened", async () => {
    let requests = 0;
    const count = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.startsWith("/api/meetings/register/")) {
        requests += 1;
      }
    };
    server.events.on("request:start", count);

    try {
      renderAt("/meetings/M08032/2023-2024");
      const first = await row(1);
      const open = within(first).getByRole("button", {
        name: "Read the decision register",
      });

      await userEvent.click(open);
      await screen.findByTestId("register-html");
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      await userEvent.click(open);
      await screen.findByTestId("register-html");

      expect(requests).toBe(1);
    } finally {
      server.events.removeListener("request:start", count);
    }
  });

  it("states a document the portal published nothing for", async () => {
    server.use(
      http.get("*/api/meetings/register/:meetingId/:kind", ({ params }) =>
        HttpResponse.json(registerMissing(Number(params.meetingId), "dr")),
      ),
    );
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);
    await userEvent.click(
      within(first).getByRole("button", { name: "Read the decision register" }),
    );

    expect(await screen.findByTestId("register-missing")).toHaveTextContent(
      "Sakarma published no decision register for this meeting.",
    );
    expect(screen.queryByTestId("register-html")).not.toBeInTheDocument();
  });

  it("states a bucket failure in the words the endpoint used", async () => {
    server.use(
      http.get("*/api/meetings/register/:meetingId/:kind", () =>
        HttpResponse.json(
          {
            detail:
              "The decision register is named in the manifest at 8/2/124/2023/245/9000/dr.html and could not be read from the bucket: 404 No such object",
          },
          { status: 502 },
        ),
      ),
    );
    renderAt("/meetings/M08032/2023-2024");
    const first = await row(1);
    await userEvent.click(
      within(first).getByRole("button", { name: "Read the decision register" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("could not be read from the bucket");
    expect(alert).toHaveTextContent("dr.html");
  });
});
