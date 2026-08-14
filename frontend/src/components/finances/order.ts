/**
 * Which projects the table shows, and in what order.
 *
 * A body-year can hold 357 projects across seven pages, and the ten that have a
 * scanned document can all sit past row 190. Alangad Grama Panchayat in
 * 2017-18 is exactly that: 10 of 301, the first at project 4 and the rest from
 * 62 onwards. A reader who pages through the first fifty rows and stops
 * concludes the body published nothing, so the filter and the sort here work
 * over the whole body-year rather than over the page on screen.
 *
 * Both live in the URL, so a filtered view is a link. The functions below are
 * pure: `ProjectTable` reads the URL, calls `arrange`, and the CSV is built
 * from the same result, which is what keeps the file and the screen the same
 * rows in the same order.
 */

import type { ProjectRow } from "./types";

/** All projects, or only the ones Sulekha holds a scan for. */
export type ProjectFilter = "all" | "with-document";

export type SortKey = "project_no" | "formulation" | "expense" | "document";

export type SortDirection = "asc" | "desc";

export interface Arrangement {
  filter: ProjectFilter;
  sort: SortKey;
  direction: SortDirection;
}

const FILTERS: ProjectFilter[] = ["all", "with-document"];
const KEYS: SortKey[] = ["project_no", "formulation", "expense", "document"];

/**
 * Which way a column runs on its first click.
 *
 * Project number ascends, because 1 to 357 is the order Sulekha numbered them
 * in. The other three descend: a reader who clicks Expense wants the largest,
 * and a reader who clicks Document wants the rows that have one.
 */
export const FIRST_DIRECTION: Record<SortKey, SortDirection> = {
  project_no: "asc",
  formulation: "desc",
  expense: "desc",
  document: "desc",
};

export const DEFAULT_ARRANGEMENT: Arrangement = {
  filter: "all",
  sort: "project_no",
  direction: FIRST_DIRECTION.project_no,
};

/** What each column is called in the header and in the sort description. */
export const COLUMN_LABEL: Record<SortKey, string> = {
  project_no: "Project no.",
  formulation: "Formulation",
  expense: "Expense",
  document: "Document",
};

/** How each direction reads for that column, said in the column's own terms. */
export const DIRECTION_LABEL: Record<SortKey, Record<SortDirection, string>> = {
  project_no: { asc: "lowest first", desc: "highest first" },
  formulation: { asc: "smallest first", desc: "largest first" },
  expense: { asc: "smallest first", desc: "largest first" },
  document: { asc: "without a document first", desc: "with a document first" },
};

function isFilter(value: string | null): value is ProjectFilter {
  return value !== null && (FILTERS as string[]).includes(value);
}

function isKey(value: string | null): value is SortKey {
  return value !== null && (KEYS as string[]).includes(value);
}

/**
 * The arrangement a URL asks for. Anything unrecognised falls back to the
 * default rather than erroring: a hand-edited or truncated link should still
 * render the table.
 */
export function readArrangement(params: URLSearchParams): Arrangement {
  const documents = params.get("documents");
  const sort = params.get("sort");
  const direction = params.get("dir");
  const key = isKey(sort) ? sort : DEFAULT_ARRANGEMENT.sort;

  return {
    filter: isFilter(documents) ? documents : DEFAULT_ARRANGEMENT.filter,
    sort: key,
    direction: direction === "asc" || direction === "desc" ? direction : FIRST_DIRECTION[key],
  };
}

/**
 * The query string for an arrangement. The default writes nothing, so an
 * untouched table has the clean URL it had before this control existed, and
 * every other view is a link that restores itself.
 */
export function writeArrangement(
  params: URLSearchParams,
  arrangement: Arrangement,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (name: string, value: string, fallback: string) => {
    if (value === fallback) next.delete(name);
    else next.set(name, value);
  };

  set("documents", arrangement.filter, DEFAULT_ARRANGEMENT.filter);
  set("sort", arrangement.sort, DEFAULT_ARRANGEMENT.sort);
  set("dir", arrangement.direction, FIRST_DIRECTION[arrangement.sort]);
  return next;
}

/**
 * Clicking a header: a new column starts in its own first direction, the
 * column already sorted on reverses.
 */
export function toggle(arrangement: Arrangement, key: SortKey): Arrangement {
  if (arrangement.sort !== key) {
    return { ...arrangement, sort: key, direction: FIRST_DIRECTION[key] };
  }
  return {
    ...arrangement,
    direction: arrangement.direction === "asc" ? "desc" : "asc",
  };
}

/** `aria-sort` for a header cell: the value ARIA defines, not a description. */
export function ariaSort(
  arrangement: Arrangement,
  key: SortKey,
): "ascending" | "descending" | "none" {
  if (arrangement.sort !== key) return "none";
  return arrangement.direction === "asc" ? "ascending" : "descending";
}

/**
 * Project numbers are digits in every row of `finance.project`, and comparing
 * them as text puts 10 before 2. Text is still compared as text, because
 * nothing guarantees the column stays numeric.
 */
function compareProjectNo(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const digits = /^\d+$/;
  if (digits.test(a) && digits.test(b)) return Number(a) - Number(b);
  return a.localeCompare(b);
}

/** Null sorts last in both directions: an absent figure is not a small one. */
function compareNumbers(a: number | null, b: number | null, sign: number): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * sign;
}

function compare(a: ProjectRow, b: ProjectRow, arrangement: Arrangement): number {
  const sign = arrangement.direction === "asc" ? 1 : -1;
  switch (arrangement.sort) {
    case "project_no":
      return compareProjectNo(a.project_no, b.project_no) * sign;
    case "formulation":
      return compareNumbers(a.formulation, b.formulation, sign);
    case "expense":
      return compareNumbers(a.expense, b.expense, sign);
    case "document":
      return (Number(a.has_pdf) - Number(b.has_pdf)) * sign;
  }
}

/**
 * Ties are common: 171 of Chalakudy Municipality's 357 projects in 2023-24
 * carry an expense of ₹0, and 291 of Alangad Grama Panchayat's 301 in 2017-18
 * have no document. Breaking them on the project number leaves the reader with
 * 1, 2, 3 inside the tie instead of the order the endpoint happened to return.
 */
function ordered(a: ProjectRow, b: ProjectRow, arrangement: Arrangement): number {
  return (
    compare(a, b, arrangement) || compareProjectNo(a.project_no, b.project_no)
  );
}

/** The whole body-year, filtered and sorted. */
export function arrange(rows: ProjectRow[], arrangement: Arrangement): ProjectRow[] {
  const kept =
    arrangement.filter === "with-document" ? rows.filter((row) => row.has_pdf) : rows;
  return [...kept].sort((a, b) => ordered(a, b, arrangement));
}
