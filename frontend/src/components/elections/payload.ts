/**
 * The shapes `/api/elections/*` and `/api/maps` return, and the four things
 * every part of this section does with them.
 *
 * The front colours are the reason this file exists. `--ldf`, `--udf`, `--nda`
 * and `--oth` are semantic tokens, identical in both themes, and the map, the
 * legend, the seat bar and the ward table all have to resolve a front to the
 * same colour. Resolving it in one place is what keeps them agreeing.
 */

/** What every public payload carries. `source` names the upstream portal. */
export interface Provenance {
  dataset: string;
  build_date: string | null;
  source?: string;
}

/** The four cycles the State Election Commission has published. */
export const CYCLES = [2010, 2015, 2020, 2025] as const;
export type Cycle = (typeof CYCLES)[number];

export const LATEST_CYCLE = 2025;

// ---------------------------------------------------------------------------
// Fronts
// ---------------------------------------------------------------------------

/**
 * The commission names other groups too — `BJP+` appears in 1,724 ward rows
 * across the earlier cycles. Those keep their own name everywhere they are
 * written and take the fourth colour, because there are four colours and the
 * source's own list is longer than four.
 */
const TOKENED = new Set(["LDF", "UDF", "NDA", "OTH"]);

/** `var(--ldf)` and friends. Written as a template so the token lint sees it. */
export function frontToken(front: string | null): string {
  if (front && TOKENED.has(front)) return front.toLowerCase();
  return "oth";
}

/** What a front is called in a legend or a cell. Never invented, never expanded. */
export function frontLabel(front: string | null): string {
  return front ?? "No front in control";
}

/**
 * The one-line reading of a body's result: who holds it, or why nobody does.
 * `control_type` is the commission's own word — hung, tie, majority.
 */
export function controlSentence(
  front: string | null,
  controlType: string | null,
): string {
  if (front) return `${front} ${controlType ?? "control"}`;
  if (controlType === "hung") return "Hung, no front in control";
  if (controlType === "tie") return "Tied, no front in control";
  return "No front in control";
}

// ---------------------------------------------------------------------------
// `/api/elections/fronts/{cycle}`
// ---------------------------------------------------------------------------

export interface FrontEntry {
  lb_code: string;
  district_name: string;
  lb_type: string;
  ruling_front: string | null;
  control_type: string | null;
  total_wards: number | null;
}

export interface DistrictFront {
  district_name: string;
  /** The district panchayat, whose result is the district's colour. */
  lb_code: string | null;
  ruling_front: string | null;
  control_type: string | null;
  bodies: number;
}

export interface FrontsPayload {
  cycle: number;
  bodies: FrontEntry[];
  districts: DistrictFront[];
  count: number;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// `/api/elections/{lb_code}/{cycle}`
// ---------------------------------------------------------------------------

export interface WardRow {
  ward_no: number | null;
  ward_code: string | null;
  ward_name: string | null;
  ward_name_ml: string | null;
  reservation: string | null;
  winner_name: string | null;
  winner_party: string | null;
  winner_front: string | null;
  winner_votes: number | null;
  runnerup_name: string | null;
  runnerup_votes: number | null;
  /** The winner's votes less the runner-up's. Null where nobody else stood. */
  margin: number | null;
  /** A share of valid votes. The commission publishes no turnout per ward. */
  margin_pct: number | null;
  valid_votes: number | null;
  invalid_votes: number | null;
  candidates: number | null;
  uncontested: boolean;
  tie: boolean;
}

/**
 * One candidate in one ward. The endpoint returns every candidate of the body
 * in one array, which is why the ward table can be clicked through without a
 * request per ward: the rows for a ward are a filter over what is already here.
 *
 * `candidate_name` is the commission's own field, Malayalam where it published
 * Malayalam. `candidate_name_en` is filled for some rows and not others, so the
 * name shown is the transliteration where there is one and the original where
 * there is not.
 */
export interface CandidateRow {
  ward_no: number | null;
  ward_name: string | null;
  candidate_name: string | null;
  candidate_name_en: string | null;
  party: string | null;
  front: string | null;
  votes: number | null;
  /** "won" or "lost", as the commission publishes it. */
  status: string | null;
  gender: string | null;
  age: number | null;
  role: string | null;
}

export function candidateName(candidate: CandidateRow): string {
  return (
    candidate.candidate_name_en ??
    candidate.candidate_name ??
    "Not named in the source"
  );
}

export interface BodyBlock {
  lb_name_en?: string;
  lb_name_ml?: string | null;
  district_name?: string;
  lb_type?: string;
}

export interface CycleResult {
  lb_code: string;
  cycle: number;
  available: true;
  reason_code: null;
  body: BodyBlock;
  seats: Record<string, number | null>;
  total_wards: number | null;
  majority_threshold: number | null;
  largest_front: string | null;
  largest_front_seats: number | null;
  ruling_front: string | null;
  control_type: string | null;
  wards: WardRow[];
  /** Every candidate of every ward, in one array. Grouped by ward on arrival. */
  candidates: CandidateRow[];
  provenance: Provenance;
}

/** The candidates of one ward, highest vote first. */
export function candidatesInWard(
  candidates: CandidateRow[],
  ward: number | null,
): CandidateRow[] {
  if (ward === null) return [];
  return candidates
    .filter((candidate) => candidate.ward_no === ward)
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
}

/**
 * Three ways a cycle holds nothing, kept apart because a page says something
 * different about each: the commission published no result for the body at
 * all, the body has results but not this cycle, or the body does not exist
 * (which is a 404 and never lands here).
 */
export interface CycleMissing {
  lb_code: string;
  cycle: number;
  available: false;
  reason_code: "no_result_published" | "no_result_for_cycle";
  reason: string;
  body: BodyBlock;
  first_cycle: number | null;
  last_cycle: number | null;
  provenance: Provenance;
}

export type CyclePayload = CycleResult | CycleMissing;

// ---------------------------------------------------------------------------
// `/api/maps`
// ---------------------------------------------------------------------------

export interface MapLayer {
  id: string;
  label: string;
  level: string;
  cycle: number;
  filename: string;
  url: string;
  format: string;
  source: string;
  boundary_vintage: string;
  per_cycle_delimitation: boolean;
  licence: string | null;
  licence_note: string;
  attribution: string;
  note?: string;
  available: boolean;
  bytes: number | null;
  unavailable_reason: string | null;
}

export interface MapsPayload {
  layers: MapLayer[];
  count: number;
  coverage: {
    bodies: number;
    with_geometry: number;
    without_geometry: number;
  };
  ward_geometry_note: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const COUNT = new Intl.NumberFormat("en-IN");

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : COUNT.format(value);
}

/** One decimal at most, and only where the endpoint gave a share. */
export function formatShare(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

/** 11,183,162 bytes reads as 10.7 MB. Sizes are for judging a download. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

export function wardLabel(ward: WardRow): string {
  const number = ward.ward_no === null ? "" : `Ward ${ward.ward_no}`;
  if (ward.ward_name && number) return `${number} ${ward.ward_name}`;
  return ward.ward_name ?? number ?? "";
}

// ---------------------------------------------------------------------------
// The map's own unit
// ---------------------------------------------------------------------------

/**
 * One territory on the map, whichever way it is drawn.
 *
 * The polygon map and the tile fallback take the same list, so the two never
 * disagree about what a click does or what a hover says.
 */
export interface MapUnit {
  /** What a click selects: a district name, an lb_code, a ward number. */
  key: string;
  name: string;
  /** The result in one clause: "UDF majority, 36 wards". */
  note: string | null;
  front: string | null;
  /** What a click does, in a sentence. Shown on hover and on focus. */
  action: string;
  selected: boolean;
}
