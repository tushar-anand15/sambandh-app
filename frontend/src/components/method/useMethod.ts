/**
 * The method page's one request.
 *
 * `/api/method` computes everything the page shows from the database it
 * describes: how many local bodies each year's source lists, what each dataset
 * holds per year, which boundary set each cycle is drawn on, and which dumps
 * the build was made from. A method page written by hand is a method page that
 * describes the build it was written against.
 */

import { useEffect, useState } from "react";

export interface BodyYear {
  year_label: string;
  bodies: number;
  /** Null in the first year: there is no earlier list to differ from. */
  entered: number | null;
  left: number | null;
}

export interface CoverageYear {
  year_label: string;
  is_complete: boolean;
  finance_bodies: number;
  projects: number;
  formulation: number | null;
  expense: number | null;
  meeting_bodies: number;
  meetings: number;
}

export interface BoundaryCycle {
  cycle: number;
  level: string;
  source: string;
  boundary_vintage: string;
  per_cycle_delimitation: boolean;
  note: string | null;
}

export interface BuildBlock {
  dataset: string;
  built_at: string;
  master_version: string;
  source_dumps: string[];
  bodies: number;
  projects: number;
  meetings: number;
  candidates: number;
}

export interface MethodPayload {
  build: BuildBlock;
  bodies_by_year: BodyYear[];
  body_diff_note: string;
  dataset_coverage: CoverageYear[];
  meetings_coverage_note: string;
  boundary_vintage: BoundaryCycle[];
  ward_geometry_note: string;
  provenance: { dataset: string; build_date: string | null; source?: string };
}

export type MethodState =
  | { status: "loading" }
  | { status: "ready"; payload: MethodPayload }
  | { status: "error"; message: string };

export function useMethod(): MethodState {
  const [state, setState] = useState<MethodState>({ status: "loading" });

  useEffect(() => {
    let live = true;

    fetch("/api/method")
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          setState({
            status: "error",
            message: `This page did not load (${response.status}).`,
          });
          return;
        }
        const payload = (await response.json()) as MethodPayload;
        if (live) setState({ status: "ready", payload });
      })
      .catch(() => {
        if (live) {
          setState({ status: "error", message: "This page did not load." });
        }
      });

    return () => {
      live = false;
    };
  }, []);

  return state;
}

/** The level a cycle's geometry is published at, in the words the map uses. */
export function levelName(level: string): string {
  return level === "ward" ? "Ward" : "Local body";
}
