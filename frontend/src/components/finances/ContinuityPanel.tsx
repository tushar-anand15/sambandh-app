/**
 * Projects that also ran the year before, and projects first seen this year.
 *
 * The counts come from `finance.lb_year_continuity` through the endpoint. The
 * lists do not: the endpoint publishes the two numbers and no project-level
 * flag, so the names below are derived here by the same rule the warehouse
 * used, matching a project name against the previous year's names.
 *
 * That derivation is shown only when it reproduces the published counts
 * exactly. When it does not, the counts stand alone and the panel says why. A
 * list that disagrees with the number above it would leave a reader to pick
 * one, and neither of them would be citable.
 *
 * The rule has a known failure. Sulekha issues a new project number every
 * year, so a name is the only thread between years, and a name like
 * "ദൈനംദിന ചെലവുകൾ" recurs across bodies and years that share nothing else.
 * The caveat is printed under the counts rather than kept in this comment.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";
import { count } from "./format";
import type { ProjectRow, YearPayload } from "./types";

interface ContinuityPanelProps {
  payload: YearPayload;
  /** The previous financial year's label, or null when it precedes the dataset. */
  previousLabel: string | null;
  /** The previous year's rows, or null while they load or where none exist. */
  previousRows: ProjectRow[] | null;
}

function names(rows: ProjectRow[] | undefined): string[] {
  if (!rows) return [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = (row.project_name ?? "").trim();
    if (name) seen.add(name);
  }
  return [...seen];
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-s3 flex flex-col gap-s1 text-t3 leading-ui">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function ContinuityPanel({
  payload,
  previousLabel,
  previousRows,
}: ContinuityPanelProps) {
  const carriedCount = payload.also_in_prev_year ?? 0;
  const newCount = payload.first_seen_this_year ?? 0;
  const distinct = payload.distinct_projects ?? carriedCount + newCount;

  const thisYear = names(payload.project_rows);
  const lastYear = new Set(names(previousRows ?? undefined));
  const carried = thisYear.filter((name) => lastYear.has(name)).sort();
  const fresh = thisYear.filter((name) => !lastYear.has(name)).sort();
  // Only a derivation that lands on the published numbers is shown.
  const listsAgree =
    previousRows !== null && carried.length === carriedCount && fresh.length === newCount;

  return (
    <section aria-labelledby="continuity-heading">
      <h2 id="continuity-heading">
        Projects carried from {previousLabel ? formatYearLabel(previousLabel) : "the year before"}
      </h2>

      <p>
        {count(carriedCount)} of {count(distinct)} distinct project names in{" "}
        {formatYearLabel(payload.year_label)} also appear in{" "}
        {previousLabel ? formatYearLabel(previousLabel) : "the previous year"}.{" "}
        {count(newCount)} are seen for the first time.
      </p>

      {previousLabel === null ? (
        <p className="notice">
          {formatYearLabel(payload.year_label)} is the first year Sulekha covers, so
          no project can be carried into it.
        </p>
      ) : null}

      <div className="flex flex-col gap-s4">
        <details className="border-t border-rule pt-s3" data-testid="carried-projects">
          <summary className="text-t3 leading-ui">
            Also in {previousLabel ? formatYearLabel(previousLabel) : "the previous year"}:{" "}
            {count(carriedCount)}
          </summary>
          {listsAgree ? (
            <List items={carried} />
          ) : (
            <p className="text-t3 text-ink-2 leading-ui mt-s3">
              The endpoint publishes the count and no project-level flag. Matching
              this year's names against{" "}
              {previousLabel ? formatYearLabel(previousLabel) : "the previous year"}{" "}
              here produced {count(carried.length)} names, so the list is withheld
              and the published count stands.
            </p>
          )}
        </details>

        <details className="border-t border-rule pt-s3" data-testid="new-projects">
          <summary className="text-t3 leading-ui">
            First seen in {formatYearLabel(payload.year_label)}: {count(newCount)}
          </summary>
          {listsAgree ? (
            <List items={fresh} />
          ) : (
            <p className="text-t3 text-ink-2 leading-ui mt-s3">
              The endpoint publishes the count and no project-level flag. Matching
              this year's names against{" "}
              {previousLabel ? formatYearLabel(previousLabel) : "the previous year"}{" "}
              here produced {count(fresh.length)} names, so the list is withheld and
              the published count stands.
            </p>
          )}
        </details>
      </div>

      <p className="notice">
        Carry-forward is measured by a project name repeating from one year to the
        next. Sulekha issues a new project number each year, so the name is the only
        thread between two years. A name that recurs by habit, such as a line for
        daily expenses, matches years that share no actual project.
      </p>

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
