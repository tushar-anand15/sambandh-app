/**
 * What the internal metrics page has to get right.
 *
 * It is read by whoever runs the project, so the claims worth protecting are
 * the ones that would mislead them: a week with no sign-ups omitted rather than
 * drawn as zero, a refusal share of nothing rendered as 0%, and — the reason
 * the page exists at all — the refusal rate being visible next to the questions
 * it is a share of.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import MetricsSection from "../MetricsSection";
import { server } from "@/test/setup";
import type { MetricsPayload } from "@/components/metrics/types";

const PAYLOAD: MetricsPayload = {
  weeks: 3,
  signups_per_week: [
    { week: "2026-07-27", signups: 2 },
    { week: "2026-08-03", signups: 0 },
    { week: "2026-08-10", signups: 5 },
  ],
  signups_total: 7,
  users_total: 9,
  questions_asked: 41,
  saved_chats: 12,
  returning_users: 3,
  assistant: { answers: 40, out_of_index_refusals: 6, out_of_index_share: 0.15 },
};

function serve(payload: Partial<MetricsPayload> = {}) {
  server.use(
    http.get("*/api/metrics", () => HttpResponse.json({ ...PAYLOAD, ...payload })),
  );
}

describe("the metrics page", () => {
  it("reports sign-ups, questions asked, saved chats and returning readers", async () => {
    serve();
    render(<MetricsSection />);

    const totals = await screen.findByTestId("metrics-totals");
    expect(within(totals).getByText("9")).toBeInTheDocument();
    expect(within(totals).getByText("7")).toBeInTheDocument();
    expect(within(totals).getByText("41")).toBeInTheDocument();
    expect(within(totals).getByText("12")).toBeInTheDocument();
    expect(within(totals).getByText("3")).toBeInTheDocument();
  });

  it("draws an empty week as zero rather than leaving a gap", async () => {
    serve();
    render(<MetricsSection />);

    const table = await screen.findByTestId("signup-weeks");
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header plus three weeks
    expect(within(table).getByText("0")).toBeInTheDocument();
  });

  it("reports the out-of-index refusal share", async () => {
    serve();
    render(<MetricsSection />);

    const health = await screen.findByTestId("assistant-health");
    expect(within(health).getByText("6")).toBeInTheDocument();
    expect(within(health).getByText("15.0%")).toBeInTheDocument();
  });

  it("states an unknown share rather than 0% when nothing has been answered", async () => {
    serve({
      assistant: { answers: 0, out_of_index_refusals: 0, out_of_index_share: null },
    });
    render(<MetricsSection />);

    const health = await screen.findByTestId("assistant-health");
    expect(within(health).getByText("—")).toBeInTheDocument();
    expect(within(health).queryByText("0.0%")).not.toBeInTheDocument();
    expect(
      await screen.findByText(/answered nothing yet/i),
    ).toBeInTheDocument();
  });

  it("states a failure instead of rendering an empty page", async () => {
    server.use(
      http.get("*/api/metrics", () => HttpResponse.json({ detail: "nope" }, { status: 500 })),
    );
    render(<MetricsSection />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/did not load/i),
    );
    expect(screen.queryByTestId("metrics-totals")).not.toBeInTheDocument();
  });
});
