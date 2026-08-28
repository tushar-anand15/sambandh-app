/**
 * Formulation and expense across the fourteen financial years.
 *
 * Two things this chart refuses to do.
 *
 * It does not draw a year with no record as zero. `/api/finances/{lb}` returns
 * every year including the ones Sulekha holds nothing for, flagged
 * `has_data: false`; those become a break in the line, because a line drawn
 * straight through them would assert a body planned nothing when the truth is
 * that the portal published nothing.
 *
 * It does not stretch. The SVG carries a viewBox and no
 * `preserveAspectRatio="none"`, and `svg[data-chart]` in index.css sizes it
 * with `height: auto`, so the type and the strokes keep their proportions at
 * every width.
 *
 * The table under the chart is the same numbers, exact, for a screen reader
 * and for anyone who wants the figure rather than the shape.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";
import { bodyName, exactRupees, unitFor } from "./format";
import styles from "./finances.module.css";
import type { BodyBlock, Provenance, SeriesYear } from "./types";

interface YearSeriesProps {
  body: BodyBlock | undefined;
  lbCode: string;
  years: SeriesYear[];
  provenance: Provenance;
}

// SVG user units. The viewBox scales them to whatever width the page gives it.
const WIDTH = 720;
const HEIGHT = 300;
const PAD_LEFT = 64;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 56;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

/** A round top for the axis: 23.9 crore becomes 25 crore, 4.1 becomes 4.5. */
function axisMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = magnitude / 2;
  return Math.ceil(max / step) * step;
}

/** Runs of consecutive years that have a record. Each run is one line. */
function segments(years: SeriesYear[], pick: (y: SeriesYear) => number | null): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  years.forEach((year, index) => {
    if (year.has_data && pick(year) !== null) {
      current.push(index);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

export default function YearSeries({ body, lbCode, years, provenance }: YearSeriesProps) {
  const name = bodyName(body, lbCode);
  const withData = years.filter((year) => year.has_data);
  const highest = Math.max(
    0,
    ...withData.map((year) => Math.max(year.formulation ?? 0, year.expense ?? 0)),
  );
  const top = axisMax(highest);
  const unit = unitFor(top);

  const first = years.length > 0 ? formatYearLabel(years[0].year_label) : "";
  const last = years.length > 0 ? formatYearLabel(years[years.length - 1].year_label) : "";
  const title = `Formulation and expense by financial year, ${name}, ${first} to ${last} (₹ ${unit.label})`;

  const x = (index: number) =>
    years.length < 2 ? PAD_LEFT + PLOT_W / 2 : PAD_LEFT + (PLOT_W * index) / (years.length - 1);
  const y = (value: number) => PAD_TOP + PLOT_H * (1 - value / top);

  const line = (pick: (year: SeriesYear) => number | null) =>
    segments(years, pick).map((run) =>
      run.map((index) => `${x(index)},${y(pick(years[index]) as number)}`).join(" "),
    );

  const ticks = [0, top / 2, top];
  // Fourteen labels do not fit under a 720-unit axis, so every second year is
  // written and the open year is always one of them.
  const labelledYears = (() => {
    const last = years.length - 1;
    const marked = new Set<number>();
    for (let i = 0; i < years.length; i += 2) marked.add(i);
    // The last year is always named, and naming it can put two labels side by
    // side -- with fourteen years, index 12 and index 13. Drop the earlier one.
    marked.add(last);
    if (marked.has(last - 1)) marked.delete(last - 1);
    return marked;
  })();
  const labelled = (index: number) => labelledYears.has(index);

  return (
    <section aria-labelledby="year-series-heading">
      {/* A heading is set in capitals, and a sentence in capitals is a shout.
          The heading names the section; the sentence that says which body,
          which years and which unit sits under it as a caption. */}
      <h2 className={styles.head} id="year-series-heading">
        Formulation and expense by year
      </h2>
      <p className={styles.caption}>{title}</p>

      <svg
        data-chart
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title}
        className="text-ink-2"
      >
        <title>{title}</title>

        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={y(value)}
              y2={y(value)}
              className="stroke-rule"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 10}
              y={y(value) + 4}
              textAnchor="end"
              className="text-t1 fill-ink-3 font-sans"
            >
              {(value / unit.divisor).toFixed(value === 0 ? 0 : 1)}
            </text>
          </g>
        ))}

        <text x={0} y={12} className="text-t1 fill-ink-3 font-sans">
          ₹ {unit.label}
        </text>

        {line((year) => year.formulation).map((points) => (
          <polyline
            key={`formulation-${points}`}
            points={points}
            fill="none"
            className="stroke-ink"
            strokeWidth={2}
          />
        ))}

        {line((year) => year.expense).map((points) => (
          <polyline
            key={`expense-${points}`}
            points={points}
            fill="none"
            className="stroke-ink-3"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
        ))}

        {years.map((year, index) => (
          <g key={year.year_label} data-year={year.year_label} data-has-data={String(year.has_data)}>
            {year.has_data ? (
              <>
                <circle cx={x(index)} cy={y(year.formulation ?? 0)} r={3} className="fill-ink" />
                <circle cx={x(index)} cy={y(year.expense ?? 0)} r={3} className="fill-ink-3" />
              </>
            ) : (
              // A gap carries a tick of its own. An unmarked absence reads as
              // an oversight, when it is a year the portal holds nothing for.
              <line
                x1={x(index)}
                x2={x(index)}
                y1={PAD_TOP + PLOT_H - 6}
                y2={PAD_TOP + PLOT_H + 6}
                className="stroke-rule-2"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            )}
            {labelled(index) ? (
              <text
                x={x(index)}
                y={HEIGHT - PAD_BOTTOM + 22}
                textAnchor={index === years.length - 1 ? "end" : "middle"}
                className="text-t1 fill-ink-3 font-sans"
              >
                {formatYearLabel(year.year_label)}
              </text>
            ) : null}
          </g>
        ))}

        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={PAD_TOP + PLOT_H}
          y2={PAD_TOP + PLOT_H}
          className="stroke-rule-2"
          strokeWidth={1}
        />
      </svg>

      <p className={styles.legend}>
        Solid line: formulation. Dashed line: expense. A break in a line is a year
        Sulekha holds no plan record for this body.
      </p>

      <table className="sr-only">
        <caption>
          Formulation and expense by financial year, {name}, {first} to {last}, in
          rupees
        </caption>
        <thead>
          <tr>
            <th scope="col">Financial year</th>
            <th scope="col">Formulation</th>
            <th scope="col">Expense</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.year_label} data-year-row={year.year_label}>
              <th scope="row">
                {formatYearLabel(year.year_label)}
                {year.is_complete ? "" : " (year in progress)"}
              </th>
              {year.has_data ? (
                <>
                  <td>{exactRupees(year.formulation)}</td>
                  <td>{exactRupees(year.expense)}</td>
                </>
              ) : (
                <>
                  <td>No record</td>
                  <td>No record</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <SourceLine
        dataset={provenance.dataset}
        build_date={provenance.build_date}
        note={provenance.source}
      />
    </section>
  );
}
