/**
 * The selector list, fetched once for the life of the tab.
 *
 * `/api/bodies` is 1,238 rows of identity and coverage flags that change only
 * when the master database is rebuilt. Finances, Meetings and Elections all
 * need the same list, and a visitor moving between the three sections should
 * not pay for it three times — so the promise, not the result, is cached at
 * module scope. Caching the promise rather than the value means two components
 * mounting in the same tick share one request instead of racing two.
 *
 * A failed request clears the cache, so a retry is a real retry rather than a
 * replay of the rejection.
 *
 * Shape follows `frontend/src/hooks/useAuth.tsx`: a plain hook over shared
 * state, no provider, because there is nothing here a caller can change.
 */

import { useEffect, useState } from "react";

/** One local body and what each section holds for it. */
export interface BodySummary {
  lb_code: string;
  lb_name_en: string;
  lb_name_ml: string | null;
  district_name: string;
  /** Grama Panchayat, Block Panchayat, District Panchayat, Municipality, Corporation. */
  lb_type: string;
  has_finances: boolean;
  has_meetings: boolean;
  has_geometry: boolean;
  in_elections: boolean;
  first_cycle: number | null;
  last_cycle: number | null;
  years_with_finance: number;
  years_with_meetings: number;
}

export interface FinancialYear {
  year_label: string;
  /** 2025-2026 is still open. A page must never compare it silently to a closed year. */
  is_complete: boolean;
}

export interface Provenance {
  dataset: string;
  build_date: string | null;
  source?: string;
}

export interface BodiesPayload {
  bodies: BodySummary[];
  count: number;
  districts: string[];
  /** The year control's options travel with the list, so no page hardcodes them. */
  financial_years: FinancialYear[];
  cycles: number[];
  provenance: Provenance;
}

const ENDPOINT = "/api/bodies";

let inFlight: Promise<BodiesPayload> | null = null;

/** The cached fetch. Callers outside React (tests, prefetch) can use it directly. */
export function fetchBodies(): Promise<BodiesPayload> {
  if (!inFlight) {
    inFlight = fetch(ENDPOINT)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load the local body list (${response.status}).`);
        }
        return (await response.json()) as BodiesPayload;
      })
      .catch((error) => {
        // Do not cache a failure: the next mount should try again.
        inFlight = null;
        throw error;
      });
  }
  return inFlight;
}

/** Drops the cache. Tests call this between cases; nothing in the app does. */
export function resetBodiesCache(): void {
  inFlight = null;
}

export interface UseBodies {
  data: BodiesPayload | null;
  loading: boolean;
  error: string | null;
}

export function useBodies(): UseBodies {
  const [state, setState] = useState<UseBodies>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    fetchBodies().then(
      (data) => live && setState({ data, loading: false, error: null }),
      (error: Error) =>
        live && setState({ data: null, loading: false, error: error.message }),
    );
    return () => {
      live = false;
    };
  }, []);

  return state;
}

// ---------------------------------------------------------------------------
// Coverage, stated rather than implied
// ---------------------------------------------------------------------------

export type Section = "finances" | "meetings" | "elections";

/**
 * Why a section holds nothing for a body.
 *
 * The wording matches `backend/app/routers/*.py` (`NOT_COVERED_REASON`,
 * `NO_RESULT_REASON`) so a visitor reads the same sentence whether the selector
 * pre-empts the request or the endpoint answers it. Absent means "we have not
 * looked"; these say who published nothing, and that is the difference between
 * a page that reads as broken and one that reads as honest.
 */
const NOT_COVERED: Record<Section, string> = {
  finances: "Sulekha holds no plan record for this body.",
  meetings: "Sakarma holds no meeting record for this body.",
  elections: "The State Election Commission published no result for this body.",
};

export interface Coverage {
  section: Section;
  label: string;
  available: boolean;
  /** Null when the section is available. Never null when it is not. */
  reason: string | null;
}

const SECTION_LABEL: Record<Section, string> = {
  finances: "Finances",
  meetings: "Meetings",
  elections: "Elections",
};

export function sectionAvailable(body: BodySummary, section: Section): boolean {
  if (section === "finances") return body.has_finances;
  if (section === "meetings") return body.has_meetings;
  return body.in_elections;
}

export function coverageOf(body: BodySummary): Coverage[] {
  return (Object.keys(SECTION_LABEL) as Section[]).map((section) => {
    const available = sectionAvailable(body, section);
    return {
      section,
      label: SECTION_LABEL[section],
      available,
      reason: available ? null : NOT_COVERED[section],
    };
  });
}

/** The reason a single section is unavailable, or null when it is not. */
export function unavailableReason(
  body: BodySummary,
  section: Section,
): string | null {
  return sectionAvailable(body, section) ? null : NOT_COVERED[section];
}
