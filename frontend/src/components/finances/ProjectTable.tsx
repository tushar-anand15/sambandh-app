/**
 * Every project in the body-year, at the rupee, with its document where one
 * exists.
 *
 * Figures here are exact. The crore and lakh above the table are for reading;
 * these are for checking against Sulekha, and the CSV button hands over these
 * same rows with no formatting at all.
 *
 * About 54% of projects statewide have a scanned document. The rest get a
 * stated absence in the last column. A link that 404s would be worse than no
 * link, and an empty cell would read as an oversight.
 */

import SourceLine from "@/components/shell/SourceLine";
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

/**
 * Where the scanned document can be reached.
 *
 * `pdf_path` is an object path inside Sulekha's document bucket, not a URL.
 * `VITE_PROJECT_PDF_BASE` names the origin that serves that bucket; without
 * it there is nothing to link to, and the column says so rather than pointing
 * at an address that does not resolve.
 */
export function pdfHref(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const base = import.meta.env.VITE_PROJECT_PDF_BASE as string | undefined;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function DocumentCell({ row }: { row: ProjectRow }) {
  const href = pdfHref(row.pdf_path);
  if (row.has_pdf && href) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        PDF
      </a>
    );
  }
  if (row.has_pdf) return <span className="text-ink-3">Held, not linkable</span>;
  return <span className="text-ink-3">None</span>;
}

export default function ProjectTable({ payload }: ProjectTableProps) {
  const rows = payload.project_rows ?? [];
  const name = bodyName(payload.body, payload.lb_code);
  const year = formatYearLabel(payload.year_label);
  const withPdf = payload.projects_with_pdf ?? rows.filter((row) => row.has_pdf).length;
  const csv = projectsCsv(rows);
  const linkable = rows.some((row) => pdfHref(row.pdf_path) !== null);

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
        {linkable
          ? ""
          : " This site publishes no address for the documents that do exist, so the column names them without linking."}
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
              rows: payload.project_rows?.length ?? 0,
            })
          }
        >
          Download CSV
        </a>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-t3 leading-ui" data-testid="project-table">
          <caption className="sr-only">
            Projects in {name}, {year}, with formulation and expense in rupees
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
            {rows.map((row, index) => (
              <tr
                key={`${row.project_no}-${index}`}
                className="border-b border-rule"
                data-project-no={row.project_no ?? ""}
              >
                <td className="py-s2" data-numeric>
                  {row.project_no}
                </td>
                <td className="py-s2">{row.project_name}</td>
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

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
