/**
 * Seats by front for one body-cycle, as a single stacked bar.
 *
 * Proportional by construction: the viewBox is 100 units wide and each segment
 * is its own share of it, so the bar carries no pixel dimension and nothing in
 * it stretches when the container changes width.
 *
 * A body the commission published no result for renders no chart at all. That
 * decision is the caller's — this component is only reached with seats to
 * draw, because an empty bar would read as a body that won nothing.
 */

import SourceLine from "@/components/shell/SourceLine";

import styles from "./elections.module.css";
import { controlSentence, formatCount, frontToken, type CycleResult } from "./payload";

const ORDER = ["LDF", "UDF", "NDA", "OTH"];

export default function SeatsBar({ result }: { result: CycleResult }) {
  const seats = ORDER.map((front) => ({ front, count: result.seats[front] ?? 0 })).filter(
    (entry) => entry.count > 0,
  );
  const total = seats.reduce((sum, entry) => sum + entry.count, 0);
  if (total === 0) return null;

  const name = [result.body.lb_name_en ?? result.lb_code, result.body.lb_type]
    .filter(Boolean)
    .join(" ");

  let x = 0;
  const segments = seats.map((entry) => {
    const width = (100 * entry.count) / total;
    const segment = { ...entry, x, width };
    x += width;
    return segment;
  });

  return (
    <section className={styles.seatBar} aria-label={`Seats by front, ${name}, ${result.cycle}`}>
      <h2 className={styles.panelTitle}>
        Seats by front, {name}, {result.cycle} (of {formatCount(total)} wards)
      </h2>
      <svg data-chart viewBox="0 0 100 6" role="img" aria-label={
        segments.map((s) => `${s.front} ${s.count}`).join(", ")
      }>
        {segments.map((segment) => (
          <rect
            key={segment.front}
            x={segment.x}
            y={0}
            width={segment.width}
            height={6}
            style={{ fill: `var(--${frontToken(segment.front)})` }}
          />
        ))}
      </svg>
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.front} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ backgroundColor: `var(--${frontToken(segment.front)})` }}
            />
            {segment.front} {formatCount(segment.count)}
          </li>
        ))}
      </ul>
      <p className={styles.layerMeta}>
        {controlSentence(result.ruling_front, result.control_type)}. Majority at{" "}
        {formatCount(result.majority_threshold)} of {formatCount(result.total_wards)} wards.
      </p>
      <SourceLine
        dataset={result.provenance.dataset}
        build_date={result.provenance.build_date}
        note={result.provenance.source}
      />
    </section>
  );
}
