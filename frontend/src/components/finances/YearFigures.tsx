/**
 * One body-year in four figures: projects, formulation, expense, and expense
 * as a share of formulation.
 *
 * Each money figure carries two lines: the rounded crore or lakh a reader
 * compares with, and the exact rupee figure a reader checks against Sulekha.
 * The share carries its base, so 49.0% is never left to stand alone.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";
import { bodyName, count, exactRupees, money, percent, yearName } from "./format";
import type { YearPayload } from "./types";

interface YearFiguresProps {
  payload: YearPayload;
}

interface Figure {
  term: string;
  value: string;
  /** The unrounded figure, where the value above it is rounded. */
  exact?: string;
}

export default function YearFigures({ payload }: YearFiguresProps) {
  const name = bodyName(payload.body, payload.lb_code);
  const year = yearName(payload.year_label, payload.is_complete);

  const figures: Figure[] = [
    { term: "Projects", value: count(payload.projects) },
    {
      term: "Formulation",
      value: money(payload.formulation),
      exact: exactRupees(payload.formulation),
    },
    { term: "Expense", value: money(payload.expense), exact: exactRupees(payload.expense) },
    {
      term: "Expense as a share of formulation",
      value: percent(payload.expense_pct),
    },
  ];

  return (
    <section aria-labelledby="year-figures-heading">
      <h2 id="year-figures-heading">
        {name}, {year}
      </h2>

      <dl className="grid grid-cols-1 gap-s5 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.term} className="border-t border-rule pt-s3">
            <dt className="label">{figure.term}</dt>
            <dd className="text-t6 leading-snug" data-numeric>
              {figure.value}
            </dd>
            {figure.exact ? (
              <dd className="text-t2 text-ink-3" data-numeric>
                {figure.exact}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      {payload.is_complete ? null : (
        <p className="notice">
          {formatYearLabel(payload.year_label)} is still open. Sulekha holds the part
          of the year published so far, so these figures will rise before the year
          closes and they do not compare with a closed year.
        </p>
      )}

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
