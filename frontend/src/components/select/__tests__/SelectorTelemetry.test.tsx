/**
 * The two events the selector is the only call site for.
 *
 * `src/lib/__tests__/telemetry.test.tsx` covers what a payload may carry and
 * what happens when Umami is unset. What it cannot cover is whether anything
 * calls `track` at all, which is what these assert: choosing a body reports
 * `body_opened`, changing the year reports `year_changed`, and restoring both
 * from a pasted URL reports neither.
 *
 * `track` is mocked rather than the network, because the selector's own request
 * for `/api/bodies` goes through the same `fetch`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BodySelector from "../BodySelector";
import { resetBodiesCache } from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";
import { bodiesWithYears } from "@/test/handlers.meetings";
import { server } from "@/test/setup";

vi.mock("@/lib/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry")>()),
  track: vi.fn(),
}));

const tracked = vi.mocked(track);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/meetings/:lb?/:year?"
          element={<BodySelector section="meetings" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("District")).toBeInTheDocument());
}

beforeEach(() => {
  resetBodiesCache();
  tracked.mockClear();
  server.use(bodiesWithYears);
});

describe("choosing a body", () => {
  it("reports the body, its tier, its district and the section", async () => {
    renderAt("/meetings");
    await ready();

    await userEvent.selectOptions(screen.getByLabelText("District"), "ERNAKULAM");
    await userEvent.selectOptions(screen.getByLabelText("Local body"), "M07025");

    expect(tracked).toHaveBeenCalledWith({
      name: "body_opened",
      lb_code: "M07025",
      lb_type: "Municipality",
      district: "ERNAKULAM",
      section: "meetings",
    });
  });

  it("reports nothing when the body is cleared", async () => {
    renderAt("/meetings/M07025");
    await ready();

    await userEvent.selectOptions(screen.getByLabelText("Local body"), "");

    expect(tracked).not.toHaveBeenCalled();
  });
});

describe("changing the year", () => {
  it("reports the year moved from and the year moved to", async () => {
    renderAt("/meetings/M07025/2023-2024");
    await ready();

    await userEvent.selectOptions(
      screen.getByLabelText("Financial year"),
      "2024-2025",
    );

    expect(tracked).toHaveBeenCalledWith({
      name: "year_changed",
      section: "meetings",
      from: "2023-2024",
      to: "2024-2025",
    });
  });

  it("reports a first year as a change from nothing", async () => {
    renderAt("/meetings/M07025");
    await ready();

    await userEvent.selectOptions(
      screen.getByLabelText("Financial year"),
      "2023-2024",
    );

    expect(tracked).toHaveBeenCalledWith({
      name: "year_changed",
      section: "meetings",
      from: null,
      to: "2023-2024",
    });
  });

  it("reports nothing for the render that restores a pasted URL", async () => {
    // The control's value comes from the URL on every render. Counting that as
    // a choice would report a year change for every page load of a link.
    renderAt("/meetings/M07025/2023-2024");
    await ready();

    expect(tracked).not.toHaveBeenCalled();
  });

  it("only ever reports years the body has a record for", async () => {
    // 2016-17 is in the list and disabled, so it cannot be the `to` of any
    // change the reader can make.
    renderAt("/meetings/M07025/2023-2024");
    await ready();

    const control = screen.getByLabelText("Financial year") as HTMLSelectElement;
    const offered = [...control.options].filter((o) => !o.disabled).map((o) => o.value);

    expect(offered).not.toContain("2016-2017");
    for (const value of offered.filter(Boolean)) {
      tracked.mockClear();
      await userEvent.selectOptions(control, value);
      for (const call of tracked.mock.calls) {
        if (call[0].name === "year_changed") {
          expect(offered).toContain(call[0].to);
        }
      }
    }
  });
});
