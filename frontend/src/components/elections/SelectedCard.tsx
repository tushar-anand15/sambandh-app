/**
 * What is selected, at the top of the page.
 *
 * A ward once one is chosen, and the local body until then. It sits above the
 * map because it answers the question the click was asking: a reader who picks
 * ward 8 should not have to scroll past the map they picked it on to read what
 * ward 8 did.
 *
 * The margin is given twice, as a count and as a share of valid votes, because
 * 412 votes means one thing in a ward of 900 and another in a ward of 9,000.
 * The share is the commission's valid votes as the base; it publishes no
 * turnout per ward, so it is not a share of the electorate and does not say it
 * is.
 */

import styles from "./elections.module.css";
import {
  controlSentence,
  formatCount,
  formatShare,
  frontToken,
  wardLabel,
  type CycleResult,
  type WardRow,
} from "./payload";

interface SelectedCardProps {
  result: CycleResult;
  /** Null until a ward is chosen, which is when the card is about the body. */
  ward: WardRow | null;
  /** "Chalakudy Municipality", built once by the page. */
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

/** The body, until a ward is chosen. */
function BodyCard({ result, bodyName, cycle }: Omit<SelectedCardProps, "ward">) {
  return (
    <section
      className={[styles.panel, styles.swap].join(" ")}
      aria-label={`Result for ${bodyName}`}
    >
      <h2 className={styles.panelTitle}>
        {bodyName}, {cycle}
      </h2>

      <p className={styles.layerMeta}>
        <span
          className={styles.partyDot}
          style={{ backgroundColor: `var(--${frontToken(result.ruling_front)})` }}
        />
        {controlSentence(result.ruling_front, result.control_type)}. A ward chosen on the
        map or in the table below fills this card with that ward's result.
      </p>

      <div className={styles.figures}>
        <Figure label="Wards" value={formatCount(result.wards.length)} />
        <Figure
          label="Largest front"
          value={result.largest_front ?? "None"}
          note={`${formatCount(result.largest_front_seats)} wards`}
        />
        <Figure
          label="Majority at"
          value={formatCount(result.majority_threshold)}
          note="wards"
        />
        <Figure
          label="Candidates"
          value={formatCount(result.candidates.length)}
          note="stood across every ward"
        />
      </div>
    </section>
  );
}

export default function SelectedCard({ result, ward, bodyName, cycle }: SelectedCardProps) {
  if (!ward) return <BodyCard result={result} bodyName={bodyName} cycle={cycle} />;

  return (
    <section
      className={[styles.panel, styles.swap].join(" ")}
      aria-label={`Result for ${wardLabel(ward)}`}
    >
      <h2 className={styles.panelTitle}>
        {wardLabel(ward)}, {bodyName}, {cycle}
      </h2>

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
