/**
 * The shell: one masthead row on every route, and a footer carrying what the
 * masthead used to.
 *
 * The old suite here asserted a collapse — `data-stuck` per route, a banner on
 * the home page only, a scroll threshold and an upward gesture to reopen. None
 * of that exists any more, so the file was rewritten rather than pruned.
 *
 * What stayed: the theme choice must survive and outrank the system
 * preference, the controls must have accessible names, and the Malayalam name
 * must still be on the site — in the footer now.
 *
 * `useAuth` is mocked because `AuthProvider` fetches `/auth/me` on mount, which
 * makes the sign-in state of the header a question about the network. The mock
 * throws when no account is set, which is exactly what the real hook does with
 * no provider above it, so the signed-out case also covers the copy tests that
 * render the masthead on its own.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Masthead from "../Masthead";
import SiteFooter from "../SiteFooter";
import TabBar from "../TabBar";

const account = vi.hoisted(() => ({
  current: null as { token: string | null; logout: () => void } | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => {
    if (!account.current) throw new Error("useAuth must be used within AuthProvider");
    return account.current;
  },
}));

const MALAYALAM = "ഗ്രാമ സംബന്ധ്";

function renderMasthead(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Masthead />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  account.current = null;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("the masthead", () => {
  it("carries the wordmark, the five tabs and the two controls", () => {
    renderMasthead();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gram Sambandh" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByTestId("masthead")).toHaveTextContent("GramSAMBANDH");
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("signin")).toBeInTheDocument();
  });

  it("is the same row on every route", () => {
    // Everything but which tab is current: the header no longer has a resting
    // state per route, which is the whole point of the change.
    const structure = () =>
      screen
        .getByTestId("masthead")
        .innerHTML.replace(/ aria-current="page"/g, "")
        .replace(/ class="[^"]*"/g, "");

    const { unmount } = renderMasthead("/");
    const home = structure();
    unmount();

    renderMasthead("/finances");
    expect(structure()).toBe(home);
  });

  it("has no collapsed state and no banner left to collapse", () => {
    renderMasthead("/");

    expect(screen.getByTestId("masthead")).not.toHaveAttribute("data-stuck");
    expect(screen.queryByTestId("masthead-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nameplate")).not.toBeInTheDocument();
  });

  it("offers a way in when signed out", () => {
    renderMasthead();

    expect(screen.getByTestId("signin")).toHaveAttribute("href", "/login");
    expect(screen.queryByTestId("account")).not.toBeInTheDocument();
  });

  it("offers saved questions and a way out when signed in", () => {
    const logout = vi.fn();
    account.current = { token: "a-token", logout };

    renderMasthead();

    expect(screen.queryByTestId("signin")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saved questions" })).toHaveAttribute(
      "href",
      "/ask",
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it("reads as signed out when there is no provider above it", () => {
    // The masthead is chrome and is rendered on its own by other suites. A
    // missing provider is a signed-out reader, not a thrown error.
    expect(() => renderMasthead()).not.toThrow();
    expect(screen.getByTestId("signin")).toBeInTheDocument();
  });
});

describe("the theme control", () => {
  it("writes the choice to the root element and to storage", () => {
    renderMasthead();

    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("gs-theme")).toBe("dark");
  });

  it("says what it will switch to", () => {
    renderMasthead();

    const toggle = screen.getByTestId("theme-toggle");
    expect(toggle).toHaveTextContent("Dark");
    expect(toggle).toHaveAccessibleName("Switch to the dark theme");

    fireEvent.click(toggle);

    expect(toggle).toHaveTextContent("Light");
    expect(toggle).toHaveAccessibleName("Switch to the light theme");
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

    renderMasthead();

    // The system says dark, so the control offers light.
    expect(screen.getByTestId("theme-toggle")).toHaveTextContent("Light");
    fireEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    matchMedia.mockRestore();
  });

  it("restores a stored choice on the next visit", () => {
    window.localStorage.setItem("gs-theme", "dark");

    renderMasthead();

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("survives storage that refuses to be read", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });

    expect(() => renderMasthead()).not.toThrow();

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

describe("the footer", () => {
  function renderFooter() {
    return render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    );
  }

  it("sets the eight letters of SAMBANDH apart from the rest", () => {
    renderFooter();

    const strapline = screen.getByTestId("strapline");
    expect(strapline).toHaveTextContent(
      "System for Analysing Meetings and Budgets for Accountable Neighbourhood Development and Hyperlocal governance",
    );
    const letters = [...strapline.querySelectorAll("i")].map((i) => i.textContent);
    expect(letters.join("")).toBe("SAMBANDH");
  });

  it("carries the Malayalam name, marked as Malayalam", () => {
    renderFooter();

    expect(screen.getByText(MALAYALAM)).toHaveAttribute("lang", "ml");
  });

  it("carries the boundary licence the banner used to", () => {
    // ODbL 1.0 requires the attribution wherever the derived data is served,
    // and the app still serves the local body boundary files.
    renderFooter();

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("OpenStreetMap contributors");
    expect(footer).toHaveTextContent("ODbL 1.0");
    expect(screen.getByRole("link", { name: "opendatakerala" })).toHaveAttribute(
      "href",
      "https://opendatakerala.org/",
    );
  });

  it("offers a way to report a wrong figure that is not a personal inbox", () => {
    // A button, not a `mailto:`. The address the report reaches is server
    // configuration, so no inbox sits in a public repository, and the form
    // works for a reader with no mail client set up. It opens ReportDialog;
    // that behaviour is covered in ReportDialog.test.tsx.
    renderFooter();

    expect(screen.getByRole("button", { name: "Report an error" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Report an error" })).not.toBeInTheDocument();
  });
});
