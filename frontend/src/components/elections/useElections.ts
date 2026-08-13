/**
 * The three requests this section makes, each as a small state machine.
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
  return useJson<FrontsPayload>(`/api/elections/fronts/${cycle}`, "The map colours");
}

/** The boundary layer inventory, its licences and what this server holds. */
export function useMaps(): Fetched<MapsPayload> {
  return useJson<MapsPayload>("/api/maps", "The boundary layer list");
}
