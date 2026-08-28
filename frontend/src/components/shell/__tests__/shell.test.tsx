/**
 * The masthead's two behaviours worth pinning: which route opens expanded, and
 * whether the theme choice survives and outranks the system preference.
 *
 * Neither is visible to jsdom as a rendered height — CSS modules do not load —
 * so the collapse is asserted through `data-stuck`, which is the same signal
 * the stylesheet keys off.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Masthead from "../Masthead";
import TabBar from "../TabBar";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

/** The nameplate has no layout in jsdom, so its height is stated outright. */
function giveNameplateHeight(px: number) {
  Object.defineProperty(screen.getByTestId("nameplate"), "offsetHeight", {
    value: px,
    configurable: true,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("the masthead", () => {
  it("carries the nameplate, the strapline and the section nav", () => {
    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gram Sambandh" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByTestId("strapline")).toHaveTextContent(
      "System for Analysing Meetings and Budgets for Accountable Neighbourhood Development & Hyperlocal governance",
    );
  });

  it("carries the Malayalam name once, and not in the accessible name", () => {
    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    const malayalam = screen.getByText("\u0d17\u0d4d\u0d30\u0d3e\u0d2e \u0d38\u0d02\u0d2c\u0d28\u0d4d\u0d27\u0d4d");
    expect(malayalam).toHaveAttribute("lang", "ml");
    // It sits inside the home link, whose aria-label keeps a screen reader
    // from hearing the same name twice.
    expect(screen.getByRole("link", { name: "Gram Sambandh" })).toContainElement(
      malayalam,
    );
  });

  it("sets the eight letters of SAMBANDH apart from the rest", () => {
    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    const letters = [...screen.getByTestId("strapline").querySelectorAll("i")].map(
      (i) => i.textContent,
    );
    expect(letters.join("")).toBe("SAMBANDH");
  });

  it("opens expanded on the home page and collapsed everywhere else", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Masthead />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "false");
    unmount();

    render(
      <MemoryRouter initialEntries={["/finances"]}>
        <Masthead />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "true");
  });

  it("draws the banner slot on the home page only", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/"]}>
        <Masthead />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("masthead-banner")).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter initialEntries={["/meetings"]}>
        <Masthead />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("masthead-banner")).not.toBeInTheDocument();
  });

  it("collapses past the nameplate and re-expands only at the top", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Masthead />
      </MemoryRouter>,
    );
    giveNameplateHeight(300);

    // Inside the nameplate's own height: still open.
    scrollTo(200);
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "false");

    scrollTo(400);
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "true");

    // The hysteresis: collapsing shortens the document, so the reader lands
    // well above the collapse threshold. It must not re-open there.
    scrollTo(120);
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "true");

    scrollTo(0);
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "false");
  });

  it("never expands on its own away from home", () => {
    render(
      <MemoryRouter initialEntries={["/elections"]}>
        <Masthead />
      </MemoryRouter>,
    );

    scrollTo(0);
    expect(screen.getByTestId("masthead")).toHaveAttribute("data-stuck", "true");
  });
});

describe("the theme control", () => {
  it("writes the choice to the root element and to storage", () => {
    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("gs-theme")).toBe("dark");
  });

  it("keeps both instances in sync", () => {
    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("theme-toggle")).toHaveTextContent("Dark");
    expect(screen.getByTestId("theme-toggle-bar")).toHaveTextContent("Dark");

    fireEvent.click(screen.getByTestId("theme-toggle-bar"));

    expect(screen.getByTestId("theme-toggle")).toHaveTextContent("Light");
    expect(screen.getByTestId("theme-toggle-bar")).toHaveTextContent("Light");
  });

  it("beats a dark system preference when the reader has chosen light", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    // The system says dark, so the control offers light.
    expect(screen.getByTestId("theme-toggle")).toHaveTextContent("Light");
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    matchMedia.mockRestore();
  });

  it("restores a stored choice on the next visit", () => {
    window.localStorage.setItem("gs-theme", "dark");

    render(
      <MemoryRouter>
        <Masthead />
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("survives storage that refuses to be read", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    expect(() =>
      render(
        <MemoryRouter>
          <Masthead />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    getItem.mockRestore();
  });
});

describe("the section nav", () => {
  it("offers the five sections in order", () => {
    render(
      <MemoryRouter>
        <TabBar />
      </MemoryRouter>,
    );

    const tabs = screen.getAllByRole("link").map((a) => a.textContent);
    expect(tabs).toEqual(["Home", "Finances", "Meetings", "Elections", "Assistant"]);
  });

  it("marks only the current section current", () => {
    render(
      <MemoryRouter initialEntries={["/meetings"]}>
        <TabBar />
      </MemoryRouter>,
    );

    // `end` on Home keeps it from matching every path — the failure mode where
    // two tabs read as current at once.
    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Meetings"]);
  });
});
