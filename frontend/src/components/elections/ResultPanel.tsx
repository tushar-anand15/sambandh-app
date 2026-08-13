/**
 * One ward's result, filled by a click on the map or on the table row.
 *
 * The margin is given twice, as a count and as a share of valid votes, because
 * 412 votes means one thing in a ward of 900 and another in a ward of 9,000.
 * The share is the commission's valid votes as the base; it publishes no
 * turnout per ward, so it is not a share of the electorate and does not say it
 * is.
 */

import styles from "./elections.module.css";
import {
  formatCount,
  formatShare,
  frontToken,
  wardLabel,
  type WardRow,
} from "./payload";

interface ResultPanelProps {
  ward: WardRow;
  /** For the panel title: which body and which cycle this ward belongs to. */
  bodyName: string;
  cycle: number;
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <p className={styles.figureLabel}>{label}</p>
      <p className={styles.figureValue} data-numeric>
        {value}
      </p>
      {note ? <p className={styles.figureNote}>{note}</p> : null}
    </div>
  );
}

export default function ResultPanel({ ward, bodyName, cycle }: ResultPanelProps) {
  const title = `${wardLabel(ward)}, ${bodyName}, ${cycle}`;

  return (
    <section className={styles.panel} aria-label={`Result for ${wardLabel(ward)}`}>
      <h3 className={styles.panelTitle}>{title}</h3>

      <p className={styles.layerMeta}>
        <span
          className={styles.partyDot}
          style={{ backgroundColor: `var(--${frontToken(ward.winner_front)})` }}
        />
        {ward.winner_name ?? "Winner not named in the source"}
        {ward.winner_party ? `, ${ward.winner_party}` : ""}
        {ward.winner_front ? ` (${ward.winner_front})` : ""}
      </p>

      <div className={styles.figures}>
        <Figure label="Winner's votes" value={formatCount(ward.winner_votes)} />
        <Figure
          label="Runner-up"
          value={formatCount(ward.runnerup_votes)}
          note={ward.uncontested ? "Uncontested" : (ward.runnerup_name ?? undefined)}
        />
        <Figure
          label="Margin"
          value={ward.uncontested ? "Uncontested" : formatCount(ward.margin)}
          note={
            ward.uncontested
              ? "No other candidate stood."
              : `${formatShare(ward.margin_pct)} of ${formatCount(ward.valid_votes)} valid votes`
          }
        />
        <Figure
          label="Reservation"
          value={ward.reservation ?? "Not stated"}
          note={`${formatCount(ward.candidates)} candidates stood`}
        />
      </div>

      {ward.tie ? (
        <p className={styles.figureNote}>
          The commission recorded this ward as a tie.
        </p>
      ) : null}
    </section>
  );
}
