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
import SourceLine from "@/components/shell/SourceLine";
import { levelName, useMethod } from "@/components/method/useMethod";

import styles from "@/components/method/method.module.css";

export default function MethodSection() {
  const state = useMethod();

  if (state.status === "loading") {
    return (
      <div className="shell-container section-page">
        <h1>How this data was built</h1>
        <p className="selector-status" aria-busy="true">
          Loading the build record.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="shell-container section-page">
        <h1>How this data was built</h1>
        <p className="notice" role="alert">
          {state.message} Reloading the page requests it again.
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
        What changed by year, which boundaries each election cycle is drawn on,
        and which dumps this build was made from. Every figure on this page is
        counted from the database it describes.
      </p>

      <h2>Local bodies listed per year</h2>
      <p>{body_diff_note}</p>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>
            Local bodies listed by Sulekha per financial year, with entries and
            departures against the previous year.
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

      <h2>What each dataset holds per year</h2>
      <p>{meetings_coverage_note}</p>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>
            Projects and meetings per financial year, statewide. The open year
            is marked; its figures are a year in progress and are not comparable
            with a closed one.
          </caption>
          <thead>
            <tr>
              <th scope="col">Financial year</th>
              <th scope="col" className={styles.numeric}>
                Bodies with a plan
              </th>
              <th scope="col" className={styles.numeric}>
                Projects
              </th>
              <th scope="col" className={styles.numeric}>
                Formulation
              </th>
              <th scope="col" className={styles.numeric}>
                Bodies with a meeting record
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

      <h2>Which boundaries each election cycle is drawn on</h2>
      <p>{ward_geometry_note}</p>
      <p>
        None of these layers should be used for anything needing a legal or
        cadastral boundary. They are built for showing election results on a
        map.
      </p>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption>
            The boundary set each election cycle is drawn on, from the layer
            inventory the map itself reads.
          </caption>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">Finest level published</th>
              <th scope="col">Source</th>
              <th scope="col">Boundary vintage</th>
              <th scope="col">Drawn for this cycle</th>
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
        The master database is rebuilt whole, not migrated, so one date
        describes all of it. These are the counts the build itself recorded.
      </p>

      <dl className={styles.build}>
        <div>
          <dt>Dataset</dt>
          <dd>{build.dataset}</dd>
        </div>
        <div>
          <dt>Built</dt>
          <dd>
            <time dateTime={builtOn}>{builtOn}</time>
          </dd>
        </div>
        <div>
          <dt>Pipeline version</dt>
          <dd>{build.master_version}</dd>
        </div>
        <div>
          <dt>Source dumps</dt>
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

      <SourceLine
        dataset={provenance.dataset}
        build_date={provenance.build_date}
        note={provenance.source}
      />
    </div>
  );
}
