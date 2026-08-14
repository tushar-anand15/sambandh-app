import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Masthead from "../Masthead";
import TabBar from "../TabBar";

describe("the app shell", () => {
  it("renders the masthead with its laterite band", () => {
    render(<Masthead />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gram Sambandh" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("offers the five sections in order", () => {
    render(
      <MemoryRouter>
        <TabBar />
      </MemoryRouter>,
    );

    const tabs = screen.getAllByRole("link").map((a) => a.textContent);
    expect(tabs).toEqual([
      "Home",
      "Finances",
      "Meetings",
      "Elections",
      "Assistant",
    ]);
  });

  it("marks only the current section active", () => {
    render(
      <MemoryRouter initialEntries={["/meetings"]}>
        <TabBar />
      </MemoryRouter>,
    );

    // `end` on Home keeps it from matching every path — the failure mode where
    // two tabs read as current at once.
    const active = screen
      .getAllByRole("link")
      .filter((a) => a.className.includes("tab-active"));
    expect(active.map((a) => a.textContent)).toEqual(["Meetings"]);
  });
});
