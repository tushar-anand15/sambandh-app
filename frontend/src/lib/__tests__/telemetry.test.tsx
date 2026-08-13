/**
 * What the telemetry client has to get right.
 *
 * The claims here are the ones that would be quietly wrong for months if they
 * broke: an SPA that reports no navigation at all, an analytics call that
 * throws in front of a reader, and — the one that matters most — an event that
 * starts carrying something about a person. The last is asserted structurally,
 * against the payload actually posted, so widening `EVENT_PROPERTIES` without
 * meaning to turns this file red.
 *
 * `.tsx` rather than `.ts` because the route hook is exercised by rendering it
 * under a real router; a hook asserted through a mock of `useLocation` would
 * prove only that the mock works.
 */

import { act, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EVENT_PROPERTIES,
  payloadFor,
  sectionOf,
  telemetryEnabled,
  track,
  useRouteTelemetry,
  type TelemetryEvent,
} from "../telemetry";

const HOST = "https://umami.test.invalid";
const WEBSITE = "11111111-2222-3333-4444-555555555555";

function enable() {
  vi.stubEnv("VITE_UMAMI_HOST", HOST);
  vi.stubEnv("VITE_UMAMI_WEBSITE_ID", WEBSITE);
}

/**
 * Every event this site is allowed to send, one of each, with real-looking
 * values. Used by the payload tests so a new event cannot skip them.
 */
const EVERY_EVENT: TelemetryEvent[] = [
  { name: "route_view", path: "/finances/M08032/2023-2024", section: "finances" },
  {
    name: "body_opened",
    lb_code: "M08032",
    lb_type: "Municipality",
    district: "Thrissur",
    section: "finances",
  },
  { name: "year_changed", section: "finances", from: "2022-2023", to: "2023-2024" },
  { name: "map_drill", level: "ward", cycle: 2020 },
  {
    name: "csv_download",
    section: "finances",
    lb_code: "M08032",
    year: "2023-2024",
    rows: 357,
  },
  { name: "layer_download", layer: "wards_2025", format: "geojson" },
  { name: "ask_cta" },
];

/** The fetch calls telemetry made, decoded. */
function sent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    body: JSON.parse(String((init as RequestInit).body)),
  }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response("", { status: 200 })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Disabled by default
// ---------------------------------------------------------------------------

describe("with the Umami host unset", () => {
  it("is disabled", () => {
    expect(telemetryEnabled()).toBe(false);
  });

  it("attempts no request and throws nothing", () => {
    for (const event of EVERY_EVENT) {
      expect(() => track(event)).not.toThrow();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is still disabled when only one of the two variables is set", () => {
    vi.stubEnv("VITE_UMAMI_HOST", HOST);

    track({ name: "ask_cta" });

    expect(telemetryEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("navigates normally with telemetry off", async () => {
    const { navigate } = renderRouted("/finances");
    await act(async () => navigate("/meetings"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("/meetings");
  });
});

// ---------------------------------------------------------------------------
// Route views
// ---------------------------------------------------------------------------

/** A tree with the hook mounted once at the root, as App.tsx mounts it. */
function renderRouted(initial: string) {
  let navigate: (to: string) => void = () => {};

  function Root() {
    useRouteTelemetry();
    navigate = useNavigate();
    return (
      <Routes>
        <Route path="*" element={<Here />} />
      </Routes>
    );
  }

  function Here() {
    // The router's own idea of where we are, not the browser's: under
    // MemoryRouter the two differ, and it is the router that navigated.
    return <p>{useLocation().pathname}</p>;
  }

  const view = render(
    <MemoryRouter initialEntries={[initial]}>
      <Root />
    </MemoryRouter>,
  );

  return { ...view, navigate: (to: string) => navigate(to) };
}

describe("route views", () => {
  beforeEach(enable);

  it("fires once on the first render, naming the path and its section", () => {
    renderRouted("/finances/M08032/2023-2024");

    const calls = sent(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${HOST}/api/send`);
    expect(calls[0].body.payload.name).toBe("route_view");
    expect(calls[0].body.payload.data).toEqual({
      path: "/finances/M08032/2023-2024",
      section: "finances",
    });
  });

  it("fires one event with the new path on navigating between sections", async () => {
    const { navigate } = renderRouted("/finances");
    fetchMock.mockClear();

    await act(async () => navigate("/meetings"));

    const calls = sent(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.payload.data).toEqual({
      path: "/meetings",
      section: "meetings",
    });
  });

  it("fires two distinct events for a rapid double navigation", async () => {
    const { navigate } = renderRouted("/finances");
    fetchMock.mockClear();

    // Back to back with nothing awaited in between — no timer to expire, no
    // idle gap. A debounce or a same-tick dedupe would collapse these into one.
    // (Each navigation is its own act, because two calls inside a single one
    // are a single React render: the intermediate location never exists, so
    // there is nothing there to have reported.)
    await act(async () => navigate("/meetings"));
    await act(async () => navigate("/elections"));
    await act(async () => navigate("/meetings"));

    // Three things the reader did — a drill-down and a bounce back out is
    // exactly the pattern this is here to see, so nothing may be dropped, and
    // returning to a path already seen is not a duplicate.
    const paths = sent(fetchMock).map((call) => call.body.payload.data.path);
    expect(paths).toEqual(["/meetings", "/elections", "/meetings"]);
  });

  it("reads the section from the first segment, and calls the root home", () => {
    expect(sectionOf("/")).toBe("home");
    expect(sectionOf("/elections/M08032/2020")).toBe("elections");
    expect(sectionOf("/method")).toBe("method");
  });
});

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

describe("downloads", () => {
  beforeEach(enable);

  it("a CSV download carries section, body, year and row count", () => {
    track({
      name: "csv_download",
      section: "finances",
      lb_code: "M08032",
      year: "2023-2024",
      rows: 357,
    });

    const [call] = sent(fetchMock);
    expect(call.body.payload.name).toBe("csv_download");
    expect(call.body.payload.data).toEqual({
      section: "finances",
      lb_code: "M08032",
      year: "2023-2024",
      rows: 357,
    });
  });

  it("a layer download carries the layer and its format", () => {
    track({ name: "layer_download", layer: "wards_2025", format: "geojson" });

    expect(sent(fetchMock)[0].body.payload.data).toEqual({
      layer: "wards_2025",
      format: "geojson",
    });
  });
});

// ---------------------------------------------------------------------------
// Failure is never visible
// ---------------------------------------------------------------------------

describe("when Umami is unreachable", () => {
  beforeEach(enable);

  it("navigation still happens and nothing is thrown", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));

    const { navigate } = renderRouted("/finances");
    await act(async () => navigate("/meetings"));
    // Let the rejection settle; an unhandled one would fail the run.
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("/meetings");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("a synchronous throw from fetch is swallowed too", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("blocked by an extension");
    });

    expect(() => track({ name: "ask_cta" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// No personal data
// ---------------------------------------------------------------------------

describe("the payload", () => {
  beforeEach(enable);

  it("carries no user id, email, IP or question text, for any event", () => {
    // A caller passing personal fields is the drift this guards against: an
    // extra property added at a call site must not reach the wire.
    const contaminated = EVERY_EVENT.map((event) => ({
      ...event,
      user_id: 4711,
      email: "reader@example.org",
      ip: "203.0.113.7",
      query: "What did Chalakudy spend in 2023-24?",
      session_id: "abc123",
      name: event.name,
    })) as TelemetryEvent[];

    for (const event of contaminated) track(event);

    const wire = JSON.stringify(sent(fetchMock));
    // Keys are matched as JSON keys — a bare "ip" would match "Municipality"
    // and pass for the wrong reason. Values are matched raw.
    for (const forbidden of [
      '"user_id"',
      '"email"',
      '"ip"',
      '"query"',
      '"session_id"',
      "4711",
      "reader@example.org",
      "203.0.113.7",
      "What did Chalakudy spend",
      "abc123",
    ]) {
      expect(wire).not.toContain(forbidden);
    }

    // And positively: every event sent exactly the properties its row in the
    // plan allows, so this passing cannot mean nothing was sent.
    for (const call of sent(fetchMock)) {
      const name = call.body.payload.name as keyof typeof EVENT_PROPERTIES;
      expect(Object.keys(call.body.payload.data).sort()).toEqual(
        [...EVENT_PROPERTIES[name]].sort(),
      );
    }
    expect(sent(fetchMock)).toHaveLength(EVERY_EVENT.length);
  });

  it("sends no credentials, so no session can ride along", () => {
    track({ name: "ask_cta" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).credentials).toBe("omit");
  });

  it("reports the path without its query string", () => {
    const event = payloadFor(
      { name: "route_view", path: "/finances", section: "finances" },
      { host: HOST, websiteId: WEBSITE },
    );

    expect(String(event.payload.url)).not.toContain("?");
  });

  it("names every allowed event and no others", () => {
    // The allowed set is the table in the plan. Adding a row is a deliberate
    // decision, and this is where an accidental one shows up.
    expect(Object.keys(EVENT_PROPERTIES).sort()).toEqual(
      [
        "ask_cta",
        "body_opened",
        "csv_download",
        "layer_download",
        "map_drill",
        "route_view",
        "year_changed",
      ].sort(),
    );
  });
});
