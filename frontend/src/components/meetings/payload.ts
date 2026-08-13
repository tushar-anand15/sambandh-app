/**
 * The `/api/meetings/{lb_code}/{year_label}` payload, and the small amount of
 * reading it needs before it can be shown.
 *
 * The endpoint answers four different things with the same status code, and
 * the page renders each of them differently:
 *
 *   404                            no local body carries that code
 *   reason_code "not_covered"      Sakarma holds no record of this body at all
 *   reason_code "no_record_for_year"  covered, but nothing for this year
 *   available: true                counts, and a row per meeting
 *
 * Collapsing any of them into an empty list would publish a claim the data does
 * not support: that the local body did not meet.
 */

export interface Provenance {
  dataset: string;
  build_date: string | null;
  /** The upstream portal, "Sakarma meeting manifest" for this section. */
  source?: string;
}

export interface BodyBlock {
  lb_code: string;
  lb_name_en: string;
  lb_name_ml: string | null;
  district_name: string;
  lb_type: string;
}

/** One row of the register, exactly as `meetings.meeting` holds it. */
export interface MeetingRow {
  meeting_date: string | null;
  /** The register's own number for the meeting. Null on rows it left unnumbered. */
  meeting_no: string | null;
  meeting_type: string;
  meeting_nature: string;
  /** Null often enough to matter: the register leaves the venue blank. */
  venue: string | null;
  category_code: string | null;
}

export interface MeetingsYear {
  lb_code: string;
  year_label: string;
  is_complete: boolean;
  body: BodyBlock;
  available: true;
  reason_code: null;
  meetings: number;
  /** By category: who met. */
  governing_body: number;
  standing_committee: number;
  /** By nature: how the meeting was called. */
  ordinary: number;
  special: number;
  first_meeting: string | null;
  last_meeting: string | null;
  meeting_rows: MeetingRow[];
  scope_note: string;
  provenance: Provenance;
}

export type MeetingsReasonCode = "not_covered" | "no_record_for_year";

export interface MeetingsMissing {
  lb_code: string;
  year_label: string;
  is_complete: boolean;
  body: BodyBlock;
  available: false;
  reason_code: MeetingsReasonCode;
  reason: string;
  provenance: Provenance;
}

export type MeetingsPayload = MeetingsYear | MeetingsMissing;

// ---------------------------------------------------------------------------
// Reading the register's own terms
// ---------------------------------------------------------------------------

/**
 * The two splits are cut in `meetings.lb_year_summary` by matching the
 * register's Malayalam text, and these constants are that same match. A row is
 * a governing body meeting when its type begins ഭരണസമിതി, and every other
 * committee named falls to standing committee; a meeting is ordinary when its
 * nature is exactly സാധാരണ യോഗം, and every other nature is special. Repeating
 * the rule here keeps a table cell and the count above it from disagreeing.
 */
export const GOVERNING_BODY_PREFIX = "ഭരണസമിതി";
export const GOVERNING_BODY_TERM = "ഭരണസമിതി യോഗം";
export const ORDINARY_TERM = "സാധാരണ യോഗം";

export function categoryOf(meetingType: string): "Governing body" | "Standing committee" {
  return meetingType.startsWith(GOVERNING_BODY_PREFIX)
    ? "Governing body"
    : "Standing committee";
}

export function natureOf(meetingNature: string): "Ordinary" | "Special" {
  return meetingNature === ORDINARY_TERM ? "Ordinary" : "Special";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const COUNT = new Intl.NumberFormat("en-IN");

export function formatCount(value: number): string {
  return COUNT.format(value);
}

/** "2023-10-12" reads as "12 October 2023". A non-date passes through. */
export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "2023-2024" reads as "2023–24", wherever it appears in a sentence. */
export function withFormattedYears(text: string): string {
  return text.replace(/\b(\d{4})-(\d{4})\b/g, (_, start: string, end: string) =>
    `${start}–${end.slice(2)}`,
  );
}

/** "18 of 64 (28.1%)". One decimal, and never a share without its base. */
export function shareOf(value: number, total: number): string {
  if (total <= 0) return formatCount(value);
  const pct = ((value / total) * 100).toFixed(1);
  return `${formatCount(value)} of ${formatCount(total)} (${pct}%)`;
}

/** "Chalakudy Municipality". */
export function bodyLabel(body: BodyBlock): string {
  return `${body.lb_name_en} ${body.lb_type}`;
}
