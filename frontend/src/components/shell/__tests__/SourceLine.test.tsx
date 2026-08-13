import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SourceLine from "../SourceLine";

describe("SourceLine", () => {
  it("renders the dataset name and the build date", () => {
    render(
      <SourceLine
        dataset="Gram Sambandh master database"
        build_date="2026-08-13"
      />,
    );

    const line = screen.getByTestId("source-line");
    expect(line).toHaveTextContent("Gram Sambandh master database");
    expect(line).toHaveTextContent("13 August 2026");

    // The machine-readable stamp survives the human formatting, so a scraper
    // and a reader see the same date.
    expect(screen.getByText("13 August 2026")).toHaveAttribute(
      "datetime",
      "2026-08-13",
    );
  });

  it("renders the dataset name with no dangling separator when the build date is null", () => {
    render(
      <SourceLine dataset="Kerala State Election Commission" build_date={null} />,
    );

    const line = screen.getByTestId("source-line");
    expect(line).toHaveTextContent("Kerala State Election Commission");
    // The failure this guards is "Kerala State Election Commission · Built" —
    // a separator that outlived its value.
    expect(line.textContent).toBe("Kerala State Election Commission");
    expect(line.textContent).not.toMatch(/·|Built/);
  });

  it("keeps a note between the dataset and the date without doubling separators", () => {
    render(
      <SourceLine
        dataset="Sulekha"
        note="plan documents"
        build_date="2026-01-01"
      />,
    );

    expect(screen.getByTestId("source-line").textContent).toBe(
      "Sulekha · plan documents · Built 1 January 2026",
    );
  });

  it("passes a build stamp it cannot parse through untouched", () => {
    render(<SourceLine dataset="Sakarma" build_date="FY2024" />);

    // Better a legible oddity than "Invalid Date" for whoever has to chase it.
    expect(screen.getByTestId("source-line").textContent).toBe(
      "Sakarma · Built FY2024",
    );
  });
});
