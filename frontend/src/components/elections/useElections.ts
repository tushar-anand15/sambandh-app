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
export function useCycleResult(lbCode: string, cycle: number): Fetched<CyclePayload> {
  return useJson<CyclePayload>(
    lbCode ? `/api/elections/${lbCode}/${cycle}` : null,
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

/** The address of the slice one map level needs. */
export function geometryUrl(
  level: "state" | "district" | "body" | "ward",
  cycle: number,
  district: string | null,
  lbCode: string | null,
): string | null {
  if (level === "state") return `/geo/districts/${cycle}.geojson`;
  if (level === "district") {
    return district ? `/geo/local-bodies/${encodeURIComponent(district)}.geojson?cycle=${cycle}` : null;
  }
  return lbCode ? `/geo/wards/${encodeURIComponent(lbCode)}.geojson?cycle=${cycle}` : null;
}
