/**
 * Telemetry: a fixed set of events, sent to a self-hosted Umami, or nowhere.
 *
 * The site needs to know which sections and which local bodies are read, which
 * downloads fire, and where a drill-down is abandoned. It does not need to know
 * who did any of it, and this module is built so it cannot find out.
 *
 * Three properties hold it together.
 *
 * **It is off unless both `VITE_UMAMI_HOST` and `VITE_UMAMI_WEBSITE_ID` are
 * set.** Unset is the default, so tests, CI and local development send nothing
 * and throw nothing. There is no queue that drains later; a disabled `track()`
 * returns having done nothing at all.
 *
 * **The event set is closed and so are its properties.** `EVENT_PROPERTIES`
 * below is the whole allowed surface, copied from the plan. Anything not named
 * there is dropped before the request is built, so a caller cannot widen what
 * is collected by passing an extra field — adding a property means editing this
 * table, which is the deliberate decision the plan asks for. No IP, no user id,
 * no email and no question text is ever sent; `lb_code` is the public
 * identifier of a public body, which is the point of the site.
 *
 * **A failure here is never visible.** Umami being down, blocked by an
 * extension, or slow must not break navigation or surface an error. Every send
 * is fire-and-forget with its rejection swallowed, and the synchronous path is
 * wrapped too, because a reader looking up what their panchayat spent should
 * never see a message about analytics.
 *
 * A note on the transport: this posts to Umami's collect endpoint directly
 * rather than loading its script tag. The script would auto-collect page views
 * — and in a client-routed SPA it would collect the wrong ones — while this
 * sends exactly the payload assembled here and nothing else.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** The events, and the only properties each may carry. */
export const EVENT_PROPERTIES = {
  route_view: ["path", "section"],
  body_opened: ["lb_code", "lb_type", "district", "section"],
  year_changed: ["section", "from", "to"],
  map_drill: ["level", "cycle"],
  csv_download: ["section", "lb_code", "year", "rows"],
  layer_download: ["layer", "format"],
  ask_cta: [],
} as const;

export type EventName = keyof typeof EVENT_PROPERTIES;

export type TelemetryEvent =
  | { name: "route_view"; path: string; section: string }
  | {
      name: "body_opened";
      lb_code: string;
      lb_type: string;
      district: string;
      section: string;
    }
  | { name: "year_changed"; section: string; from: string | null; to: string | null }
  // "block" is the block panchayat tier, which sits between a district and a
  // grama panchayat. It is its own level because it is its own election.
  | {
      name: "map_drill";
      level: "district" | "block" | "body" | "ward";
      cycle: number | null;
    }
  | {
      name: "csv_download";
      section: string;
      lb_code: string;
      year: string | null;
      rows: number;
    }
  | { name: "layer_download"; layer: string; format: string }
  | { name: "ask_cta" };

interface Config {
  host: string;
  websiteId: string;
}

/** Null when either variable is unset, which is what makes this a no-op. */
export function telemetryConfig(): Config | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const host = env.VITE_UMAMI_HOST?.trim();
  const websiteId = env.VITE_UMAMI_WEBSITE_ID?.trim();
  if (!host || !websiteId) return null;
  return { host: host.replace(/\/+$/, ""), websiteId };
}

export function telemetryEnabled(): boolean {
  return telemetryConfig() !== null;
}

/**
 * The section a path belongs to — the dimension every other number is read by.
 *
 * The first segment, or `home` for `/`. Unknown first segments are reported as
 * themselves rather than bucketed as "other", so a route nobody remembers
 * adding still shows up under its own name.
 */
export function sectionOf(path: string): string {
  const first = path.split("?")[0].split("/").filter(Boolean)[0];
  return first ?? "home";
}

/**
 * Keep only the properties the event is allowed to carry.
 *
 * Undefined values are dropped; null is kept, because "this body has no
 * election cycle" is a fact worth counting and dropping it would silently
 * merge those rows into the ones that do.
 */
function allowedData(event: TelemetryEvent): Record<string, unknown> {
  const allowed: readonly string[] = EVENT_PROPERTIES[event.name];
  const source = event as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) data[key] = source[key];
  }
  return data;
}

/**
 * The body posted to Umami. Exported so a test can assert on it without a
 * network, and so the no-personal-data check reads the real payload.
 */
export function payloadFor(event: TelemetryEvent, config: Config) {
  return {
    type: "event",
    payload: {
      website: config.websiteId,
      // The path only. No query string: a filter is a reading of public data,
      // but a query string is the one place a stray identifier could ride along.
      url: typeof window === "undefined" ? "/" : window.location.pathname,
      hostname: typeof window === "undefined" ? "" : window.location.hostname,
      name: event.name,
      data: allowedData(event),
    },
  };
}

/**
 * Send one event. Returns immediately; nothing waits on the network.
 *
 * Disabled, this does nothing and touches no global. Enabled, it posts and
 * discards both the response and any failure.
 */
export function track(event: TelemetryEvent): void {
  const config = telemetryConfig();
  if (config === null) return;

  try {
    void fetch(`${config.host}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(event, config)),
      // Survives the unload a download or an outbound link can cause.
      keepalive: true,
      // Umami is cookieless; sending credentials would be the one way this
      // could start carrying a session.
      credentials: "omit",
      mode: "cors",
    }).catch(() => undefined);
  } catch {
    // A synchronous throw — no fetch in the environment, a malformed host —
    // is as invisible as a rejected promise. Telemetry never reaches a reader.
  }
}

/**
 * Fire `route_view` on every navigation.
 *
 * An SPA reports nothing by default: client-side routing means the analytics
 * service never sees `/finances/M08032/2023-2024`, because no document is ever
 * requested for it. This hook is the thing that makes section usage measurable
 * at all, and it is mounted once at the root so every route is covered by one
 * call site rather than by a line in each section that somebody will forget.
 *
 * Deliberately not debounced. Two navigations in quick succession are two
 * things the reader did — that is exactly the drill-down-then-back pattern this
 * is here to see — and collapsing them would erase it.
 */
export function useRouteTelemetry(): void {
  const location = useLocation();
  const path = location.pathname;

  useEffect(() => {
    track({ name: "route_view", path, section: sectionOf(path) });
  }, [path]);
}
