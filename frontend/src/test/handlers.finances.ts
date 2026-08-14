/**
 * MSW handlers for finances.
 *
 * Owned by the Finances section so its fixtures can grow without touching
 * the other sections' mocks.
 *
 * Two sets of handlers live here, and the reason is a contract test.
 * `harness.test.tsx` asserts that `/api/finances/M08032/2023-2024` returns
 * exactly the `chalakudyFinances` object exported by `handlers.ts`. That is
 * what makes the shared fixture a contract. So the default `handlers` answer
 * that one body-year with that exact object, and
 * `detailedHandlers` answer it with the whole payload the endpoint really
 * returns: project rows, continuity, provenance and the classification note.
 * A page test installs the second set with `server.use(...)`.
 *
 * Every figure below is the fixture slice's, which is the master database's.
 * Chalakudy Municipality 2023-24 is 357 projects, ₹23,88,06,688 formulated,
 * ₹11,69,13,203 spent, 351 with a document, 140 carried and 214 first seen.
 * The 357 project rows are generated so their formulation and expense sum to
 * those totals exactly, because a table that does not add up to the figure
 * above it is worse than no table.
 */

import { http, HttpResponse } from "msw";

import { chalakudyFinances, financialYears, knownCode, notFound, provenance } from "./handlers";

const SOURCE = "Sulekha plan monitoring portal";
const CLASSIFICATION_NOTE =
  "Sulekha publishes no sector or category for a project, and none is inferred here.";

const financeProvenance = { ...provenance, source: SOURCE };

interface FixtureBody {
  lb_code: string;
  lb_name_en: string;
  lb_name_ml: string | null;
  district_name: string;
  lb_type: string;
}

const BODIES: Record<string, FixtureBody> = {
  M08032: {
    lb_code: "M08032",
    lb_name_en: "Chalakudy",
    lb_name_ml: "ചാലക്കുടി",
    district_name: "THRISSUR",
    lb_type: "Municipality",
  },
  G13064: {
    lb_code: "G13064",
    lb_name_en: "Panoor",
    lb_name_ml: null,
    district_name: "KANNUR",
    lb_type: "Grama Panchayat",
  },
};

function bodyBlock(lbCode: string): FixtureBody {
  return (
    BODIES[lbCode] ?? {
      lb_code: lbCode,
      lb_name_en: lbCode,
      lb_name_ml: null,
      district_name: "THRISSUR",
      lb_type: "Municipality",
    }
  );
}

/**
 * The years Sulekha holds a plan record for, per body. Panoor's record stops
 * in 2014-15, which is what makes it the fixture for a gapped series.
 */
const COVERED: Record<string, string[]> = {
  G13064: ["2012-2013", "2013-2014", "2014-2015"],
};

function coveredYears(lbCode: string): string[] {
  return COVERED[lbCode] ?? financialYears.map((year) => year.year_label);
}

// ---------------------------------------------------------------------------
// Project rows
// ---------------------------------------------------------------------------

export interface ProjectRow {
  project_no: string;
  project_name: string;
  formulation: number;
  expense: number;
  has_pdf: boolean;
  pdf_path: string | null;
  pdf_url: string | null;
}

/**
 * The shape `app/presign.py` returns: a V4 signed URL against the object in
 * `gs://sulekhasakarma-pdfs`. The signature is a placeholder, because nothing
 * in the browser verifies it — what the page has to get right is that the
 * address is the object's, and that an expiring URL never reaches the CSV.
 */
const SIGNED_HOST = "https://storage.googleapis.com/sulekhasakarma-pdfs";

function signed(path: string): string {
  return `${SIGNED_HOST}/${path}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=3600&X-Goog-Signature=fixture`;
}

/**
 * What the endpoint publishes when the deployment holds no signing key. The
 * sentence is `NO_KEY_REASON` in `backend/app/presign.py`; the operator-facing
 * one naming the setting is logged there and never reaches a payload.
 */
export const NO_SIGNING_KEY_REASON =
  "This site cannot produce an address for the project documents, so the " +
  "scans Sulekha holds are named here without being reachable.";

/** Splits a total across n rows so the rows sum to the total to the rupee. */
function split(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rows = Array.from({ length: n }, () => base);
  rows[n - 1] += total - base * n;
  return rows;
}

function rows(options: {
  names: string[];
  formulation: number;
  expense: number;
  /** The first n rows have a document, unless `documentAt` overrides it. */
  withPdf: number;
  /** The project numbers that have one, where they are not the first n. */
  documentAt?: number[];
  folder: string;
  yearLabel: string;
}): ProjectRow[] {
  const { names, formulation, expense, withPdf, documentAt, folder, yearLabel } =
    options;
  const scanned = documentAt ? new Set(documentAt) : null;
  const formulations = split(formulation, names.length);
  const expenses = split(expense, names.length);
  return names.map((name, index) => {
    const projectNo = String(index + 1);
    const hasPdf = scanned ? scanned.has(index + 1) : index < withPdf;
    const path = hasPdf ? `pdfs/${yearLabel}/${folder}/${projectNo}.pdf` : null;
    return {
      project_no: projectNo,
      project_name: name,
      formulation: formulations[index],
      expense: expenses[index],
      has_pdf: hasPdf,
      pdf_path: path,
      pdf_url: path ? signed(path) : null,
    };
  });
}

const project = (n: number) => `പദ്ധതി ${n}`;

/**
 * 354 distinct names across 357 rows: three projects repeat a name inside the
 * year, which is why `distinct_projects` and `projects` differ. Names 1 to 140
 * also run in 2022-23; 141 to 354 are first seen in 2023-24.
 */
const CHALAKUDY_2023_NAMES = [
  ...Array.from({ length: 354 }, (_, i) => project(i + 1)),
  project(1),
  project(2),
  project(3),
];

const CHALAKUDY_2022_NAMES = [
  ...Array.from({ length: 140 }, (_, i) => project(i + 1)),
  ...Array.from({ length: 60 }, (_, i) => project(1000 + i + 1)),
];

const CHALAKUDY_2023_ROWS = rows({
  names: CHALAKUDY_2023_NAMES,
  formulation: chalakudyFinances.formulation,
  expense: chalakudyFinances.expense,
  withPdf: 351,
  folder: "Municipality/Thrissur/Chalakudy_Municipality",
  yearLabel: "2023-2024",
});

const CHALAKUDY_2022_ROWS = rows({
  names: CHALAKUDY_2022_NAMES,
  formulation: 198765432,
  expense: 92345678,
  withPdf: 176,
  folder: "Municipality/Thrissur/Chalakudy_Municipality",
  yearLabel: "2022-2023",
});

/**
 * A body-year in which almost nothing has a document, which is the case the
 * filter exists for. It is modelled on Alangad Grama Panchayat's 2017-18
 * record in the master database, where 10 of 301 projects have a scan and only
 * one of the ten is on the first page of fifty. A reader who pages through
 * that table and stops concludes the body published nothing at all. The
 * figures here are constructed; the distribution is the one that caused the
 * report.
 */
export const SPARSE = {
  lbCode: "G04036",
  yearLabel: "2017-2018",
  projects: 301,
  documentAt: [4, 62, 69, 80, 277, 285, 291, 296, 300, 301],
};

const SPARSE_ROWS = rows({
  names: Array.from({ length: SPARSE.projects }, (_, i) => project(i + 1)),
  formulation: 84_500_000,
  expense: 41_200_000,
  withPdf: 0,
  documentAt: SPARSE.documentAt,
  folder: "Grama_Panchayat/Alappuzha/Muttar_Grama_Panchayat",
  yearLabel: SPARSE.yearLabel,
});

/** A small, generic body-year for every code the fixtures do not name. */
function genericRows(lbCode: string, yearLabel: string): ProjectRow[] {
  return rows({
    names: Array.from({ length: 12 }, (_, i) => project(i + 1)),
    formulation: 12_400_000,
    expense: 6_200_000,
    withPdf: 7,
    folder: `Municipality/Thrissur/${lbCode}`,
    yearLabel,
  });
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function isComplete(yearLabel: string): boolean {
  return yearLabel !== "2025-2026";
}

function noRecord(lbCode: string, yearLabel: string) {
  const covered = coveredYears(lbCode);
  return {
    available: false as const,
    reason_code: "no_record_for_year",
    reason:
      `Sulekha records no projects for ${yearLabel}. ` +
      `This body's plan record runs from ${covered[0]} to ${covered[covered.length - 1]}.`,
    lb_code: lbCode,
    year_label: yearLabel,
    is_complete: isComplete(yearLabel),
    body: bodyBlock(lbCode),
    provenance: financeProvenance,
  };
}

function previousLabel(yearLabel: string): string {
  const start = Number(yearLabel.slice(0, 4)) - 1;
  return `${start}-${start + 1}`;
}

/** One body-year that has a record. */
function fullYear(lbCode: string, yearLabel: string) {
  const chalakudy2023 = lbCode === "M08032" && yearLabel === "2023-2024";
  const sparse = lbCode === SPARSE.lbCode && yearLabel === SPARSE.yearLabel;
  const projectRows = chalakudy2023
    ? CHALAKUDY_2023_ROWS
    : lbCode === "M08032" && yearLabel === "2022-2023"
      ? CHALAKUDY_2022_ROWS
      : sparse
        ? SPARSE_ROWS
        : genericRows(lbCode, yearLabel);

  const formulation = sum(projectRows.map((row) => row.formulation));
  const expense = sum(projectRows.map((row) => row.expense));
  const distinct = new Set(projectRows.map((row) => row.project_name)).size;
  // The generic rows repeat the same twelve names every year, so a year whose
  // predecessor is covered carries all twelve and starts none.
  const carriedOver = coveredYears(lbCode).includes(previousLabel(yearLabel));

  return {
    lb_code: lbCode,
    year_label: yearLabel,
    is_complete: isComplete(yearLabel),
    body: bodyBlock(lbCode),
    available: true as const,
    reason_code: null,
    projects: projectRows.length,
    formulation,
    expense,
    expense_pct: chalakudy2023
      ? chalakudyFinances.expense_pct
      : Number(((expense / formulation) * 100).toFixed(1)),
    projects_with_pdf: projectRows.filter((row) => row.has_pdf).length,
    distinct_projects: distinct,
    also_in_prev_year: chalakudy2023
      ? chalakudyFinances.also_in_prev_year
      : carriedOver
        ? distinct
        : 0,
    first_seen_this_year: chalakudy2023
      ? chalakudyFinances.first_seen_this_year
      : carriedOver
        ? 0
        : distinct,
    project_rows: projectRows,
    pdf_url_reason: null,
    classification: null,
    classification_note: CLASSIFICATION_NOTE,
    provenance: financeProvenance,
  };
}

/** The body-year payload, present or absent, as `finances_year` returns it. */
export function yearPayload(lbCode: string, yearLabel: string) {
  return coveredYears(lbCode).includes(yearLabel)
    ? fullYear(lbCode, yearLabel)
    : noRecord(lbCode, yearLabel);
}

/** The fourteen-year series, empty years kept as rows with `has_data: false`. */
export function seriesPayload(lbCode: string) {
  const covered = coveredYears(lbCode);
  const years = financialYears.map((year) => {
    if (!covered.includes(year.year_label)) {
      return {
        year_label: year.year_label,
        is_complete: year.is_complete,
        has_data: false,
        projects: null,
        formulation: null,
        expense: null,
        expense_pct: null,
        projects_with_pdf: null,
        also_in_prev_year: null,
        first_seen_this_year: null,
      };
    }
    const payload = fullYear(lbCode, year.year_label);
    return {
      year_label: year.year_label,
      is_complete: year.is_complete,
      has_data: true,
      projects: payload.projects,
      formulation: payload.formulation,
      expense: payload.expense,
      expense_pct: payload.expense_pct,
      projects_with_pdf: payload.projects_with_pdf,
      also_in_prev_year: payload.also_in_prev_year,
      first_seen_this_year: payload.first_seen_this_year,
    };
  });

  return {
    lb_code: lbCode,
    body: bodyBlock(lbCode),
    available: true as const,
    reason_code: null,
    years,
    years_with_finance: covered.length,
    provenance: financeProvenance,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const seriesHandler = http.get("*/api/finances/:lb", ({ params }) => {
  const { lb } = params as { lb: string };
  if (!knownCode(lb)) return notFound(lb);
  return HttpResponse.json(seriesPayload(lb));
});

/**
 * The default set. `/api/finances/M08032/2023-2024` answers with the shared
 * `chalakudyFinances` object unchanged, because `harness.test.tsx` compares
 * against it field for field.
 */
export const handlers = [
  seriesHandler,
  http.get("*/api/finances/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    if (lb === "M08032" && year === "2023-2024") {
      return HttpResponse.json(chalakudyFinances);
    }
    return HttpResponse.json(yearPayload(lb, year));
  }),
];

/**
 * The full payload for every body-year, Chalakudy 2023-24 included. Installed
 * per test with `server.use(...detailedHandlers)`.
 */
export const detailedHandlers = [
  seriesHandler,
  http.get("*/api/finances/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    return HttpResponse.json(yearPayload(lb, year));
  }),
];

/**
 * A body-year Sulekha attached no scan to at all. The filter has to state that
 * rather than offer a choice that would empty the table.
 */
export const noDocumentHandlers = [
  seriesHandler,
  http.get("*/api/finances/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    const payload = yearPayload(lb, year);
    if (!payload.available) return HttpResponse.json(payload);
    return HttpResponse.json({
      ...payload,
      projects_with_pdf: 0,
      project_rows: payload.project_rows.map((row) => ({
        ...row,
        has_pdf: false,
        pdf_path: null,
        pdf_url: null,
      })),
    });
  }),
];

/**
 * A deployment with no signing key: every document is held and none has an
 * address. The page has to say so once and keep the rows, which is the state
 * a local checkout without GOOGLE_APPLICATION_CREDENTIALS is actually in.
 */
export const unsignedHandlers = [
  seriesHandler,
  http.get("*/api/finances/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    const payload = yearPayload(lb, year);
    if (!payload.available) return HttpResponse.json(payload);
    return HttpResponse.json({
      ...payload,
      pdf_url_reason: NO_SIGNING_KEY_REASON,
      project_rows: payload.project_rows.map((row) => ({ ...row, pdf_url: null })),
    });
  }),
];
