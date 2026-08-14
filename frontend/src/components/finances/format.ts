/**
 * Money, counts and the CSV, in one place.
 *
 * Two rules run through every function here. Figures in prose are rounded to
 * crore or lakh, because a reader comparing two years wants a magnitude.
 * Figures in the table and in the CSV are exact to the rupee, because a reader
 * checking a total against Sulekha wants the digits the portal published.
 *
 * Indian numbering throughout: crore and lakh, never million.
 */

import { formatYearLabel } from "@/components/select/YearControl";
import type { ProjectFilter } from "./order";
import type { BodyBlock, ProjectRow } from "./types";

/**
 * "Chalakudy Municipality". The type is part of the name a reader recognises,
 * and two bodies in one district can share the English name across tiers.
 */
export function bodyName(body: BodyBlock | undefined, fallback: string): string {
  if (!body) return fallback;
  return `${body.lb_name_en} ${body.lb_type}`;
}

/**
 * "2023–24", and "2025–26 (year in progress)" for the open year. The
 * qualifier travels with the label so the open year cannot appear beside a
 * closed one without carrying it.
 */
export function yearName(yearLabel: string, isComplete: boolean): string {
  const label = formatYearLabel(yearLabel);
  return isComplete ? label : `${label} (year in progress)`;
}

export const CRORE = 10_000_000;
export const LAKH = 100_000;

const GROUPED = new Intl.NumberFormat("en-IN");

/** Exact to the rupee, grouped Indian-style: 238806688 reads ₹23,88,06,688. */
export function exactRupees(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `₹${GROUPED.format(value)}`;
}

/** A plain count: 3412 reads 3,412. */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return GROUPED.format(value);
}

/**
 * Rounded for prose: ₹23.88 crore, ₹45.00 lakh, ₹8,200.
 *
 * The unit is chosen per figure, so a page never mixes crore with millions.
 * Two decimals on crore and lakh keeps ₹23.88 crore distinguishable from
 * ₹23.9 crore when a reader is comparing it against the exact figure below it.
 */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const size = Math.abs(value);
  if (size >= CRORE) return `₹${(value / CRORE).toFixed(2)} crore`;
  if (size >= LAKH) return `₹${(value / LAKH).toFixed(2)} lakh`;
  return exactRupees(value);
}

/** One decimal, never more: 49 reads 49.0%. */
export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `${value.toFixed(1)}%`;
}

/** The unit a set of figures is best read in, for a chart axis or a title. */
export function unitFor(max: number): { label: "crore" | "lakh"; divisor: number } {
  return max >= CRORE
    ? { label: "crore", divisor: CRORE }
    : { label: "lakh", divisor: LAKH };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * The same columns `backend/app/routers/download.py` writes, in the same
 * order, so the file a reader downloads from the page and the file they curl
 * from `/api/download/finances/...` are the same file.
 */
export const CSV_COLUMNS = [
  "project_no",
  "project_name",
  "formulation",
  "expense",
  "has_pdf",
  "pdf_path",
] as const;

function cell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = typeof value === "boolean" ? (value ? "True" : "False") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The rows on screen, unrounded and unformatted. No thousands separator, no
 * crore, no rounding: a CSV is a file to compute with.
 */
export function projectsCsv(rows: ProjectRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        cell(row.project_no),
        cell(row.project_name),
        cell(row.formulation),
        cell(row.expense),
        cell(row.has_pdf),
        cell(row.pdf_path),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Matches the filename the download endpoint sets, with the filter appended
 * where one is on. Two files in a downloads folder called
 * `finances_M08032_2023-2024.csv` holding different row counts is a way to
 * misread a body-year, and the suffix is what keeps them apart.
 */
export function csvFilename(
  lbCode: string,
  yearLabel: string,
  filter: ProjectFilter = "all",
): string {
  const scope = filter === "with-document" ? "_with-document" : "";
  return `finances_${lbCode}_${yearLabel}${scope}.csv`;
}

/**
 * A data URL rather than a blob URL: the file is built from rows already in
 * memory, and `URL.createObjectURL` would leave a handle to revoke on a page
 * whose only job is to hand over a few hundred rows.
 */
export function csvHref(text: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(text)}`;
}
