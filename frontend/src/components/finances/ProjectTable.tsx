/**
 * Every project in the body-year, at the rupee, with its document alongside.
 *
 * This table is the page. The figures above it are four numbers a reader can
 * hold in their head; the answer to "what did my panchayat actually spend the
 * money on" is here, one row per project, and clicking a row opens the
 * sanctioning document in a drawer beside the table rather than sending the
 * reader off to a downloads folder.
 *
 * Figures are exact. The crore and lakh above the table are for reading; these
 * are for checking against Sulekha, and the CSV hands over these same rows with
 * no formatting at all.
 *
 * Paginated at 50 rows because the largest bodies publish over a thousand
 * projects in a year, and a table that long is one a reader scrolls past rather
 * than reads. The CSV is always the whole year, not the page on screen.
 *
 * About 54% of projects statewide have a scanned document. The rest get a
 * stated absence in the last column: an empty cell would read as an oversight.
 */

import { useEffect, useState } from "react";

import SourceLine from "@/components/shell/SourceLine";
import PdfDrawer from "@/components/viewer/PdfDrawer";
import { formatYearLabel } from "@/components/select/YearControl";
import {
  bodyName,
  count,
  csvFilename,
  csvHref,
  exactRupees,
  projectsCsv,
} from "./format";
import type { ProjectRow, YearPayload } from "./types";
import { track } from "@/lib/telemetry";

interface ProjectTableProps {
  payload: YearPayload;
}

export const PAGE_SIZE = 50;

/** A row can be opened when Sulekha holds a document and this site has its address. */
export function isOpenable(row: ProjectRow): boolean {
  return row.has_pdf && row.pdf_url !== null;
}

function DocumentCell({ row }: { row: ProjectRow }) {
  if (isOpenable(row)) return <span>View</span>;
  if (row.has_pdf) return <span className="text-ink-3">Held, no address</span>;
  // Sulekha published these as a plan line with no scan attached. "None"
  // reads as a missing value; the document was never published at all.
  return <span className="text-ink-3">Not published</span>;
}

export default function ProjectTable({ payload }: ProjectTableProps) {
  const rows = payload.project_rows ?? [];
  const name = bodyName(payload.body, payload.lb_code);
  const year = formatYearLabel(payload.year_label);
  const withPdf = payload.projects_with_pdf ?? rows.filter((row) => row.has_pdf).length;
  const csv = projectsCsv(rows);

  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<ProjectRow | null>(null);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // A body-year with fewer pages than the one before it would otherwise leave
  // the reader on a page that no longer exists.
  useEffect(() => {
    setPage(0);
    setOpen(null);
  }, [payload.lb_code, payload.year_label]);

  const first = page * PAGE_SIZE;
  const shown = rows.slice(first, first + PAGE_SIZE);

  // Opening a document sends no event. `EVENT_PROPERTIES` in lib/telemetry.ts
  // is a closed set fixed by the plan, and widening it is a decision for the
  // plan rather than for this table.
  function openRow(row: ProjectRow) {
    if (!isOpenable(row)) return;
    setOpen(row);
  }

  if (rows.length === 0) {
    return (
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">
          Projects, {name}, {year}
        </h2>
        <p className="notice">
          Sulekha records totals for {year} and publishes no project rows behind
          them.
        </p>
        <SourceLine
          dataset={payload.provenance.dataset}
          build_date={payload.provenance.build_date}
          note={payload.provenance.source}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">
        Projects, {name}, {year}
      </h2>

      <p>
        {count(withPdf)} of {count(rows.length)} projects have a scanned document in
        Sulekha. The rest were published as a plan line with nothing attached.
        {payload.pdf_url_reason ? ` ${payload.pdf_url_reason}` : ""}
      </p>

      <p>
        <a
          href={csvHref(csv)}
          download={csvFilename(payload.lb_code, payload.year_label)}
          data-testid="download-csv"
          onClick={() =>
            track({
              name: "csv_download",
              section: "finances",
              lb_code: payload.lb_code,
              year: payload.year_label,
              rows: rows.length,
            })
          }
        >
          Download CSV
        </a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-t3 leading-ui" data-testid="project-table">
          <caption className="sr-only">
            Projects in {name}, {year}, with formulation and expense in rupees.
            Rows {count(first + 1)} to {count(first + shown.length)} of{" "}
            {count(rows.length)}.
          </caption>
          <thead>
            <tr className="border-b border-rule-2">
              <th scope="col" className="label py-s2 text-left">
                Project no.
              </th>
              <th scope="col" className="label py-s2 text-left">
                Project
              </th>
              <th scope="col" className="label py-s2 text-right">
                Formulation
              </th>
              <th scope="col" className="label py-s2 text-right">
                Expense
              </th>
              <th scope="col" className="label py-s2 text-left">
                Document
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr
                key={`${row.project_no}-${first + index}`}
                className="border-b border-rule"
                data-project-no={row.project_no ?? ""}
                data-openable={String(isOpenable(row))}
                onClick={() => openRow(row)}
              >
                <td className="py-s2" data-numeric>
                  {row.project_no}
                </td>
                <td className="py-s2">
                  {isOpenable(row) ? (
                    // The row is clickable for a mouse; the button is what a
                    // keyboard and a screen reader reach it by.
                    <button
                      type="button"
                      className="text-left text-accent underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openRow(row);
                      }}
                    >
                      {row.project_name}
                    </button>
                  ) : (
                    row.project_name
                  )}
                </td>
                <td className="py-s2 text-right" data-numeric>
                  {exactRupees(row.formulation)}
                </td>
                <td className="py-s2 text-right" data-numeric>
                  {exactRupees(row.expense)}
                </td>
                <td className="py-s2">
                  <DocumentCell row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="mt-s4 flex items-center gap-s4"
        aria-label="Project table pages"
        data-testid="table-pages"
      >
        <button
          type="button"
          className="label border border-rule px-s3 py-s2"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          disabled={page === 0}
        >
          Previous
        </button>
        <p className="text-t2 text-ink-2" data-testid="page-position">
          Rows {count(first + 1)} to {count(first + shown.length)} of{" "}
          {count(rows.length)}
        </p>
        <button
          type="button"
          className="label border border-rule px-s3 py-s2"
          onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}
          disabled={page >= pages - 1}
        >
          Next
        </button>
      </nav>

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />

      <PdfDrawer
        open={open !== null}
        title={open?.project_name ?? ""}
        subtitle={
          open
            ? `Project ${open.project_no}, ${name}, ${year}`
            : undefined
        }
        url={open?.pdf_url ?? null}
        unavailableReason={payload.pdf_url_reason}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
