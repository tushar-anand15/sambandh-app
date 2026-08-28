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
import styles from "./finances.module.css";
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

  // The share, drawn. The bar restates the fourth figure above it and adds no
  // number of its own, so a reader who cannot see it loses nothing.
  const share =
    payload.expense_pct === undefined || payload.expense_pct === null
      ? null
      : Math.max(0, Math.min(100, payload.expense_pct));

  return (
    <section aria-labelledby="year-figures-heading">
      <h2 className={styles.head} id="year-figures-heading">
        {name}, {year}
      </h2>

      <dl className={styles.figures}>
        {figures.map((figure) => (
          <div key={figure.term} className={styles.figure}>
            <dt className={styles.figureTerm}>{figure.term}</dt>
            <dd className={styles.figureValue} data-numeric>
              {figure.value}
            </dd>
            {figure.exact ? (
              <dd className={styles.figureExact} data-numeric>
                {figure.exact}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      {share !== null ? (
        <div className={styles.bar} data-testid="expense-share-bar">
          {/* Proportional by construction: the viewBox is 100 units wide and
              the filled part takes its own percentage of it, so the bar
              carries no pixel dimension and nothing in it stretches. */}
          <svg
            data-chart="share"
            className={styles.barTrack}
            viewBox="0 0 100 4"
            role="img"
            aria-label={`${percent(payload.expense_pct)} of the planned amount was paid`}
          >
            <rect x="0" y="0" width={share} height="4" className={styles.barFill} />
          </svg>
          <div className={styles.barScale}>
            <span>{money(payload.expense)} paid</span>
            <span>{money(payload.formulation)} planned</span>
          </div>
        </div>
      ) : null}

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
