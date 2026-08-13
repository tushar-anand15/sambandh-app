/**
 * The shapes `/api/finances/{lb}` and `/api/finances/{lb}/{year}` return.
 *
 * Mirrors `backend/app/routers/finances.py`. Money and counts arrive
 * unrounded, and every field the endpoint can answer with null is null here. A
 * year with no record carries nulls, never zeroes, and that difference is the
 * whole reason the series endpoint keeps empty years in the list.
 */

export interface Provenance {
  dataset: string;
  build_date: string | null;
  source?: string;
}

export interface BodyBlock {
  lb_code: string;
  lb_name_en: string;
  lb_name_ml: string | null;
  district_name: string;
  lb_type: string;
}

/** One row of `finance.project`, as the table and the CSV both read it. */
export interface ProjectRow {
  project_no: string | null;
  project_name: string | null;
  formulation: number | null;
  expense: number | null;
  /** Roughly 54% of projects statewide. The rest need a stated absence. */
  has_pdf: boolean;
  /** The object path inside Sulekha's bucket. Stable, and what the CSV keeps. */
  pdf_path: string | null;
  /**
   * A signed Cloud Storage URL, good for an hour from the moment the endpoint
   * answered. Null where the row has no document, and null for every row where
   * the deployment holds no signing key — `pdf_url_reason` says which.
   */
  pdf_url: string | null;
}

/** One financial year in the fourteen-year series, present or absent. */
export interface SeriesYear {
  year_label: string;
  /** 2025-2026 is open. It never sits beside a closed year unlabelled. */
  is_complete: boolean;
  /** False where Sulekha holds no plan record for this body in this year. */
  has_data: boolean;
  projects: number | null;
  formulation: number | null;
  expense: number | null;
  expense_pct: number | null;
  projects_with_pdf: number | null;
  also_in_prev_year: number | null;
  first_seen_this_year: number | null;
}

export interface SeriesPayload {
  lb_code: string;
  body: BodyBlock;
  available: boolean;
  reason_code: string | null;
  reason?: string;
  years?: SeriesYear[];
  years_with_finance?: number;
  provenance: Provenance;
}

export interface YearPayload {
  lb_code: string;
  year_label: string;
  is_complete: boolean;
  body?: BodyBlock;
  available: boolean;
  reason_code: string | null;
  reason?: string;
  projects?: number;
  formulation?: number;
  expense?: number;
  expense_pct?: number;
  projects_with_pdf?: number;
  distinct_projects?: number;
  also_in_prev_year?: number;
  first_seen_this_year?: number;
  project_rows?: ProjectRow[];
  /** Null where every document has an address. A sentence where none does. */
  pdf_url_reason?: string | null;
  /** Always null. The field exists so its absence is a statement, not a gap. */
  classification?: null;
  classification_note?: string;
  provenance: Provenance;
}
