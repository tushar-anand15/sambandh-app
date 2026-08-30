/**
 * The four requests this section makes, each as a small state machine.
 *
 * `useFronts` is the one that shapes the page. The map needs one colour per
 * territory across 1,237 bodies; reading that from the per-body endpoint would
 * be a request per body, each carrying every ward and candidate row, so
 * `/api/elections/fronts/{cycle}` answers all of them in one payload that a
 * shared cache can hold for a day.
 *
 * A 404 is kept apart from a transport failure: a code that matches no local
 * body and a backend that is down are different facts, and the page says
 * different things about them.
 */

import { useEffect, useState } from "react";

import type { GeoCollection } from "./geometry";
import type { CyclePayload, FrontsPayload, MapsPayload } from "./payload";

export type Fetched<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; payload: T }
  | { status: "not-found"; lbCode: string }
  | { status: "error"; message: string };

/** One GET, cancelled on unmount, with the two failure modes kept apart. */
function useJson<T>(url: string | null, whatFailed: string, lbCode = ""): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>({ status: "idle" });

  useEffect(() => {
    if (url === null) {
      setState({ status: "idle" });
      return;
    }

    let live = true;
    setState({ status: "loading" });

    fetch(url)
      .then(async (response) => {
        if (!live) return;
        if (response.status === 404 && lbCode) {
          setState({ status: "not-found", lbCode });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `${whatFailed} did not load (${response.status}).`,
          });
          return;
        }
        const payload = (await response.json()) as T;
        if (live) setState({ status: "ready", payload });
      })
      .catch(() => {
        if (live) setState({ status: "error", message: `${whatFailed} did not load.` });
      });

    return () => {
      live = false;
    };
  }, [url, whatFailed, lbCode]);

  return state;
}

/** One body, one cycle: seats, wards and candidates, or a stated cause. */
export function useCycleResult(
  lbCode: string,
  cycle: number | null,
): Fetched<CyclePayload> {
  return useJson<CyclePayload>(
    lbCode && cycle !== null ? `/api/elections/${lbCode}/${cycle}` : null,
    "The result",
    lbCode,
  );
}

/** Every body's ruling front for one cycle. The map's colours. */
export function useFronts(cycle: number): Fetched<FrontsPayload> {
  return useJson<FrontsPayload>(`/api/elections/fronts/${cycle}`, "The map");
}

/** The boundary layer inventory, its licences and what this server holds. */
export function useMaps(): Fetched<MapsPayload> {
  return useJson<MapsPayload>("/api/maps", "The list of boundary files");
}

/**
 * Which block panchayat each grama panchayat sits in.
 *
 * The master database carries a body's district and its type and no parent, so
 * this is derived server-side from the published geometry — a block panchayat
 * is exactly the union of its grama panchayats. It is one small payload for
 * the whole state, cached hard, and it is what lets the reader ask "which
 * grama panchayats are in this block?" at all.
 *
 * It is stated once, not per cycle: every layer the build publishes is
 * crosswalked onto the same boundary snapshot, so a per-cycle answer would be
 * the same answer three times. Bodies the layers do not hold are simply absent
 * from it, which is how the page knows they cannot be placed.
 */
export interface BlockMembership {
  of_block: Record<string, string>;
  blocks: { lb_code: string; grama_panchayats: string[] }[];
  count: number;
  blocks_count: number;
}

export function useBlockMembership(): Fetched<BlockMembership> {
  return useJson<BlockMembership>("/geo/block-membership.json", "The block membership");
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The boundaries for one level of one cycle.
 *
 * `absent` is its own state and carries the endpoint's own sentence. A cycle
 * with no published layer at this level is not an error and not an empty map:
 * it is the case the tile fallback exists for, and the reason is what the page
 * shows instead of a boundary nobody drew.
 */
export type GeometryState =
  | { status: "loading" }
  | { status: "ready"; collection: GeoCollection }
  | { status: "absent"; reason: string }
  | { status: "error"; message: string };

const NO_LAYER = "No boundaries have been published at this level.";

/**
 * One slice of geometry, cut server-side. `url` is null where the level has
 * nothing to draw yet — before a district is chosen, or before the body list
 * has loaded — and the hook stays in `loading` rather than fetching.
 */
export function useGeometry(url: string | null): GeometryState {
  const [state, setState] = useState<GeometryState>({ status: "loading" });

  useEffect(() => {
    if (url === null) {
      setState({ status: "loading" });
      return;
    }

    let live = true;
    setState({ status: "loading" });

    fetch(url)
      .then(async (response) => {
        if (!live) return;
        if (response.status === 404) {
          const body = (await response.json().catch(() => null)) as
            | { detail?: string }
            | null;
          setState({ status: "absent", reason: body?.detail ?? NO_LAYER });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `The boundaries did not load (${response.status}).`,
          });
          return;
        }
        const collection = (await response.json()) as GeoCollection;
        if (live) setState({ status: "ready", collection });
      })
      .catch(() => {
        if (live) setState({ status: "error", message: "The boundaries did not load." });
      });

    return () => {
      live = false;
    };
  }, [url]);

  return state;
}

/**
 * The addresses of the slices the panes draw. One tier per request, always.
 *
 * The three rural tiers cover the same ground, and asking for two of them at
 * once would stack polygons on every point. Each pane asks for its own level
 * and gets the complete set at that level.
 *
 * A body's own outline, which the pre-2025 ward panes draw around their cells,
 * is not a request of its own: it is the one feature keyed to that body in the
 * slice its tier was already drawn from.
 */
export function districtsUrl(cycle: number): string {
  return `/geo/districts/${cycle}.geojson`;
}

export function blocksUrl(district: string | null, cycle: number): string | null {
  if (!district) return null;
  return `/geo/blocks/${encodeURIComponent(district)}.geojson?cycle=${cycle}`;
}

export function localBodiesUrl(
  district: string | null,
  cycle: number,
  block: string | null = null,
): string | null {
  if (!district) return null;
  const inBlock = block ? `&block=${encodeURIComponent(block)}` : "";
  return `/geo/local-bodies/${encodeURIComponent(district)}.geojson?cycle=${cycle}${inBlock}`;
}

export function wardsUrl(lbCode: string | null, cycle: number): string | null {
  if (!lbCode) return null;
  return `/geo/wards/${encodeURIComponent(lbCode)}.geojson?cycle=${cycle}`;
}

/** The one feature a slice holds for one body, or null where it holds none. */
export function featureFor(
  geometry: GeometryState,
  lbCode: string | null,
): GeoCollection | null {
  if (geometry.status !== "ready" || !lbCode) return null;
  const feature = geometry.collection.features.find(
    (candidate) => String(candidate.properties.lb_code) === lbCode,
  );
  if (!feature) return null;
  return { ...geometry.collection, features: [feature] };
}
