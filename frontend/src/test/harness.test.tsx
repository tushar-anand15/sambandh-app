/**
 * Proves the harness itself works, before any product component exists.
 *
 * Two things are being checked, and nothing else: that jsdom plus
 * testing-library can render a React component and assert on the DOM, and that
 * MSW intercepts at the network boundary so a component's own fetch is answered
 * by the shared handlers.
 *
 * The components here are defined inline on purpose. A harness test that
 * imported a real component would go red when that component changed, and then
 * nobody could tell whether the harness or the product had broken.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { chalakudyFinances } from "./handlers";
import { server } from "./setup";

const API = "http://localhost/api";

describe("jsdom and testing-library", () => {
  it("renders a component and finds it by role", () => {
    render(<h1>Gram Sambandh</h1>);

    expect(screen.getByRole("heading", { name: "Gram Sambandh" })).toBeInTheDocument();
  });

  it("handles an interaction and re-renders", async () => {
    function Counter() {
      const [n, setN] = useState(0);
      return <button onClick={() => setN(n + 1)}>selected {n}</button>;
    }
    render(<Counter />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("selected 1");
  });
});

/** A stand-in for the pages Units 7 to 9 will write: fetch, then render. */
function Finances({ lb, year }: { lb: string; year: string }) {
  const [state, setState] = useState<string>("loading");

  useEffect(() => {
    let live = true;
    fetch(`${API}/finances/${lb}/${year}`)
      .then(async (r) =>
        r.ok ? `${(await r.json()).projects} projects` : `error ${r.status}`,
      )
      .then((text) => live && setState(text))
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [lb, year]);

  return <p>{state}</p>;
}

describe("MSW at the network boundary", () => {
  it("answers a component's fetch from the shared handlers", async () => {
    render(<Finances lb="M08032" year="2023-2024" />);

    expect(await screen.findByText("357 projects")).toBeInTheDocument();
  });

  it("serves the payload shape the endpoint contract promises", async () => {
    const payload = await (await fetch(`${API}/finances/M08032/2023-2024`)).json();

    expect(payload).toEqual(chalakudyFinances);
    expect(payload.provenance.dataset).toBe("Gram Sambandh master database");
  });

  it("returns a reason, not an empty list, for a section a body lacks", async () => {
    // Mattannur: the SEC published no result. A bare [] would render as a chart
    // with no bars, which reads as "no seats won" rather than "no result".
    const payload = await (await fetch(`${API}/elections/M13057/2025`)).json();

    expect(payload.available).toBe(false);
    expect(payload.reason).toMatch(/State Election Commission/);
  });

  it("404s an unknown body code, naming the code", async () => {
    const response = await fetch(`${API}/finances/M99999/2023-2024`);

    expect(response.status).toBe(404);
    expect((await response.json()).detail).toContain("M99999");
  });

  it("lets a single test override a handler without leaking into the next", async () => {
    server.use(
      http.get("*/api/finances/:lb/:year", () =>
        HttpResponse.json({ detail: "upstream unavailable" }, { status: 503 }),
      ),
    );
    render(<Finances lb="M08032" year="2023-2024" />);

    expect(await screen.findByText("error 503")).toBeInTheDocument();
  });

  it("is back to the default handlers in the next test", async () => {
    render(<Finances lb="M08032" year="2023-2024" />);

    expect(await screen.findByText("357 projects")).toBeInTheDocument();
  });
});
