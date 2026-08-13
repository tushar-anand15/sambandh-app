/**
 * What each section of the site holds, counted from the site's own endpoints.
 *
 * Every figure here is derived at render time from `/api/bodies` and
 * `/api/maps`. Nothing is written down. A coverage table with a typed-in "1,200
 * local bodies" is correct for exactly as long as nobody rebuilds the database,
 * and the failure is silent: the page keeps stating the old number with the
 * same confidence as the new one.
 *
 * The denominators differ by row on purpose. The first three count against the
 * selector list, which is every local body the master database reconciles. The
 * boundary row counts against `/api/maps`'s own coverage block, because it is
 * the map's inventory that knows which bodies have geometry.
 */

import { formatCount, formatShare } from "@/components/elections/payload";
import { useMaps } from "@/components/elections/useElections";
import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";
import { useBodies } from "@/hooks/useBodies";

import styles from "./home.module.css";

interface Row {
  section: string;
  href: string;
  covered: number;
  total: number;
  source: string;
}

function share(covered: number, total: number): string {
  return total === 0 ? "—" : formatShare((covered / total) * 100);
}

export default function CoverageTable() {
  const bodies = useBodies();
  const maps = useMaps();

  if (bodies.loading || maps.status === "loading" || maps.status === "idle") {
    return (
      <p className="selector-status" aria-busy="true">
        Counting what each section holds.
      </p>
    );
  }

  if (bodies.error || maps.status !== "ready" || !bodies.data) {
    return (
      <p className="notice" role="alert">
        The coverage figures did not load. Reloading the page requests them
        again.
      </p>
    );
  }

  const list = bodies.data.bodies;
  const total = list.length;
  const coverage = maps.payload.coverage;

  const rows: Row[] = [
    {
      section: "Finances",
      href: "/finances",
      covered: list.filter((body) => body.has_finances).length,
      total,
      source: "Sulekha plan monitoring portal",
    },
    {
      section: "Meetings",
      href: "/meetings",
      covered: list.filter((body) => body.has_meetings).length,
      total,
      source: "Sakarma meeting manifest",
    },
    {
      section: "Elections",
      href: "/elections",
      covered: list.filter((body) => body.in_elections).length,
      total,
      source: "Kerala State Election Commission",
    },
    {
      section: "Boundaries",
      href: "/elections",
      covered: coverage.with_geometry,
      total: coverage.bodies,
      source: "KSMART vector tiles and the opendatakerala OpenStreetMap release",
    },
  ];

  const years = bodies.data.financial_years;
  const firstYear = years.length ? formatYearLabel(years[0].year_label) : null;
  const lastYear = years.length
    ? formatYearLabel(years[years.length - 1].year_label)
    : null;

  return (
    <>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>
            Local bodies with a record in each section, of the{" "}
            {formatCount(total)} the master database holds.
          </caption>
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col" className={styles.numeric}>
                Local bodies
              </th>
              <th scope="col" className={styles.numeric}>
                Share
              </th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.section}>
                <th scope="row">
                  <a href={row.href}>{row.section}</a>
                </th>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.covered)} of {formatCount(row.total)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {share(row.covered, row.total)}
                </td>
                <td>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.period}>
        Finances run from {firstYear} to {lastYear}, the open year included and
        labelled as open. Election results cover the{" "}
        {bodies.data.cycles.join(", ")} cycles. Ward boundaries exist for 2025
        only; the three earlier cycles reuse one November 2020 snapshot, and{" "}
        <a href="/method">the method page</a> gives the vintage per cycle.
      </p>

      <SourceLine
        dataset={bodies.data.provenance.dataset}
        build_date={bodies.data.provenance.build_date}
      />
    </>
  );
}
