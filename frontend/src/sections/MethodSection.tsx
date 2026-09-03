/**
 * The method page.
 *
 * Everything here is read from `/api/method`, which computes it from the same
 * database the rest of the site queries. A hand-written method page describes
 * the build it was written against, and there is no way to tell from the page
 * which build that was.
 *
 * Tone follows `sulekha/docs/geo_runbook.md`: state the gap, its extent and its
 * cause, and do not soften a limitation of the source. First-person plural is
 * allowed here and nowhere else on the site, per `docs/instructions.md`
 * section 11.
 */

import { formatCount } from "@/components/elections/payload";
import { money } from "@/components/finances/format";
import { formatYearLabel } from "@/components/select/YearControl";
import { levelName, useMethod } from "@/components/method/useMethod";

import styles from "@/components/method/method.module.css";

export default function MethodSection() {
  const state = useMethod();

  if (state.status === "loading") {
    return (
      <div className="shell-container section-page">
        <h1>How this data was built</h1>
        <p className="selector-status" aria-busy="true">
          Loading.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="shell-container section-page">
        <h1>How this data was built</h1>
        <p className="notice" role="alert">
          {state.message} Reload the page to try again.
        </p>
      </div>
    );
  }

  const {
    build,
    bodies_by_year,
    body_diff_note,
    dataset_coverage,
    meetings_coverage_note,
    boundary_vintage,
    ward_geometry_note,
    provenance,
  } = state.payload;

  const builtOn = build.built_at.slice(0, 10);

  return (
    <div className="shell-container section-page">
      <h1>How this data was built</h1>
      <p className="lede">
        What changed by year, which boundaries each election is drawn on, and
        the files this site was built from.
      </p>

      <h2>Local bodies listed per year</h2>
      <p>{body_diff_note}</p>

      <div className="data-table-scroll">
        <table className={`data-table ${styles.termsTable}`}>
          <caption>
            Local bodies listed by Sulekha per financial year, with those that
            entered and left against the previous year.
          </caption>
          <thead>
            <tr>
              <th scope="col">Financial year</th>
              <th scope="col" className={styles.numeric}>
                Local bodies
              </th>
              <th scope="col" className={styles.numeric}>
                Entered
              </th>
              <th scope="col" className={styles.numeric}>
                Left
              </th>
            </tr>
          </thead>
          <tbody>
            {bodies_by_year.map((row) => (
              <tr key={row.year_label}>
                <th scope="row">{formatYearLabel(row.year_label)}</th>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.bodies)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {row.entered === null ? (
                    <span className={styles.absent}>no earlier year</span>
                  ) : (
                    formatCount(row.entered)
                  )}
                </td>
                <td className={styles.numeric} data-numeric>
                  {row.left === null ? (
                    <span className={styles.absent}>no earlier year</span>
                  ) : (
                    formatCount(row.left)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What each section covers per year</h2>
      <p>{meetings_coverage_note}</p>

      <div className="data-table-scroll">
        <table className={`data-table ${styles.termsTable}`}>
          <caption>
            Projects and meetings per financial year, across Kerala. The year
            still running is marked, and its figures cover part of a year.
          </caption>
          <thead>
            <tr>
              <th scope="col">Financial year</th>
              <th scope="col" className={styles.numeric}>
                Local bodies with projects
              </th>
              <th scope="col" className={styles.numeric}>
                Projects
              </th>
              <th scope="col" className={styles.numeric}>
                Formulation
              </th>
              <th scope="col" className={styles.numeric}>
                Local bodies with meetings
              </th>
              <th scope="col" className={styles.numeric}>
                Meetings
              </th>
            </tr>
          </thead>
          <tbody>
            {dataset_coverage.map((row) => (
              <tr key={row.year_label}>
                <th scope="row">
                  {formatYearLabel(row.year_label)}
                  {row.is_complete ? null : (
                    <span className={styles.absent}> (in progress)</span>
                  )}
                </th>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.finance_bodies)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.projects)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {money(row.formulation)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.meeting_bodies)}
                </td>
                <td className={styles.numeric} data-numeric>
                  {formatCount(row.meetings)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Which boundaries each election is drawn on</h2>
      <p>{ward_geometry_note}</p>
      <p>
        These boundaries are drawn for showing election results on a map. Do not
        use them to settle where a property or a ward line falls on the ground.
      </p>

      <div className="data-table-scroll">
        <table className={`data-table ${styles.termsTable}`}>
          <caption>
            The boundaries behind each election map.
          </caption>
          <thead>
            <tr>
              <th scope="col">Election</th>
              <th scope="col">Smallest area published</th>
              <th scope="col">Source</th>
              <th scope="col">Boundaries drawn</th>
              <th scope="col">Drawn for this election</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {boundary_vintage.map((row) => (
              <tr key={row.cycle}>
                <th scope="row">{row.cycle}</th>
                <td>{levelName(row.level)}</td>
                <td className={styles.wrap}>{row.source}</td>
                <td className={styles.wrap}>{row.boundary_vintage}</td>
                <td>{row.per_cycle_delimitation ? "Yes" : "No"}</td>
                <td className={styles.wrap}>
                  {row.note ?? <span className={styles.absent}>none</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>The build</h2>
      <p>
        Everything on this site comes from one build, made on the date below.
      </p>

      <dl className={styles.build}>
        <div>
          <dt>Data</dt>
          <dd>{build.dataset}</dd>
        </div>
        <div>
          <dt>Built</dt>
          <dd>
            <time dateTime={builtOn}>{builtOn}</time>
          </dd>
        </div>
        <div>
          <dt>Build version</dt>
          <dd>{build.master_version}</dd>
        </div>
        <div>
          <dt>Source files</dt>
          <dd>{build.source_dumps.join(", ")}</dd>
        </div>
        <div>
          <dt>Local bodies</dt>
          <dd data-numeric>{formatCount(build.bodies)}</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd data-numeric>{formatCount(build.projects)}</dd>
        </div>
        <div>
          <dt>Meetings</dt>
          <dd data-numeric>{formatCount(build.meetings)}</dd>
        </div>
        <div>
          <dt>Candidates</dt>
          <dd data-numeric>{formatCount(build.candidates)}</dd>
        </div>
      </dl>

    </div>
  );
}
