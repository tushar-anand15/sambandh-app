/**
 * The result of the body a pane was opened by.
 *
 * Click a district and the map fills with block panchayats; click a block and
 * it fills with grama panchayats. Both times the body that was clicked has a
 * result of its own, and both times that result is invisible on the level it
 * opened. This is the line that carries it, with the way through to its own
 * wards and candidates.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";
import { controlSentence, formatCount, frontToken } from "./payload";
import { electionsPath } from "./selection";

interface OwnResultProps {
  front: string | null;
  controlType: string | null;
  /** Its own ward count for this cycle, where the payload carries one. */
  wards: number | null;
  /** Where its own wards and candidates are. Null where it has no result. */
  lbCode: string | null;
  cycle: number;
  /**
   * One more fact about this body's result, where there is one worth stating.
   * The body pane uses it for the ward count either side of a delimitation.
   */
  note?: string | null;
}

export default function OwnResult({
  front,
  controlType,
  wards,
  lbCode,
  cycle,
  note = null,
}: OwnResultProps) {
  return (
    <p className={styles.ownResult}>
      <span
        className={styles.ownSwatch}
        style={{ backgroundColor: `var(--${frontToken(front)})` }}
        aria-hidden="true"
      />
      <span>
        {controlSentence(front, controlType)}
        {wards === null ? "" : `, ${formatCount(wards)} wards`}.{" "}
        {note ? `${note} ` : ""}
        {lbCode ? (
          <Link to={electionsPath({ cycle, lbCode })}>Its wards and candidates</Link>
        ) : null}
      </span>
    </p>
  );
}
