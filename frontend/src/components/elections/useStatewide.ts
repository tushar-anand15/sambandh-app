/**
 * Kerala's whole local-body result for one cycle.
 *
 * Mirrors `StatewideElections` in `backend/app/routers/elections.py` field for
 * field. Four distributions over three stated denominators: seats over
 * `seats_total`, margins and reservation over `wards_counted`, control over
 * `bodies_with_result`. The endpoint states each of them rather than leaving a
 * page to infer one, because 1,033, 1,199 and 1,238 are all correct counts of
 * Kerala's local governments for different questions.
 *
 * A cycle the Commission published nothing for answers 200 with
 * `available: false` and nulls in every figure, which is not an error and not
 * a zero. The block that reads this says the record is absent instead of
 * drawing a chart of noughts.
 */

import { useEffect, useState } from "react";

import type { Provenance } from "./payload";

export interface FrontSeats {
  front: string;
  seats: number | null;
  /** A share of `seats_total`, 0–1. Null where no body has a published result. */
  share: number | null;
}

export interface MarginBand {
  key: string;
  label: string;
  min_votes: number | null;
  max_votes: number | null;
  wards: number | null;
  share: number | null;
}

export interface ControlCount {
  /** The Commission's own word: majority, hung, tie, or unstated. */
  control_type: string;
  bodies: number | null;
  share: number | null;
}

export interface ReservationCount {
  reservation: string;
  wards: number | null;
  share: number | null;
}

export interface StatewidePayload {
  cycle: number;
  available: boolean;
  reason_code: string | null;
  reason: string | null;
  bodies_with_result: number;
  wards_counted: number;
  seats: FrontSeats[];
  seats_total: number | null;
  margins: MarginBand[];
  control: ControlCount[];
  reservation: ReservationCount[];
  provenance: Provenance;
}

export type StatewideState =
  | { status: "loading" }
  | { status: "ready"; payload: StatewidePayload }
  | { status: "error"; message: string };

/** One GET per cycle, cancelled on unmount. */
export function useStatewide(cycle: number): StatewideState {
  const [state, setState] = useState<StatewideState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });

    fetch(`/api/elections/statewide/${cycle}`)
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          setState({
            status: "error",
            message: `The statewide figures did not load (${response.status}).`,
          });
          return;
        }
        const payload = (await response.json()) as StatewidePayload;
        if (live) setState({ status: "ready", payload });
      })
      .catch(() => {
        if (live) {
          setState({ status: "error", message: "The statewide figures did not load." });
        }
      });

    return () => {
      live = false;
    };
  }, [cycle]);

  return state;
}

/** A share the endpoint gave as 0–1, read as a percentage with one decimal. */
export function statewideShare(share: number | null): string {
  return share === null ? "—" : `${(share * 100).toFixed(1)}%`;
}
