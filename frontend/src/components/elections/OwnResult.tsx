/**
 * The result of the body the reader just clicked, above the tier below it.
 *
 * This is the sentence the map cannot draw. Click a district and the map fills
 * with block panchayats; click a block and it fills with grama panchayats. Both
 * times the thing that was clicked has a result of its own, and both times that
 * result is invisible on the level it opened. A reader is then one small step
 * from believing the colours below add up to the colour above.
 *
 * They do not, and nothing about the picture looks wrong enough to correct
 * them, so the correction is written rather than implied.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";
import { controlSentence, frontToken } from "./payload";
import { electionsPath } from "./selection";

interface OwnResultProps {
  /** "Thrissur District Panchayat", "Chalakudy Block Panchayat". */
  name: string;
  /** The tier drawn below it, named in the plural: "block panchayats". */
  below: string;
  front: string | null;
  controlType: string | null;
  /** Where its own wards and candidates are. Null where it has no result. */
  lbCode: string | null;
  cycle: number;
}

export default function OwnResult({
  name,
  below,
  front,
  controlType,
  lbCode,
  cycle,
}: OwnResultProps) {
  return (
    <p className={styles.ownResult}>
      <span
        className={styles.ownSwatch}
        style={{ backgroundColor: `var(--${frontToken(front)})` }}
        aria-hidden="true"
      />
      <span>
        <b>{name}</b> was won by {controlSentence(front, controlType)}. That is its
        own election, to its own body. The {below} below are a different
        election, and their colours are not a summary of this one — nor is this
        colour a summary of theirs.{" "}
        {lbCode ? (
          <Link to={electionsPath({ cycle, lbCode })}>
            See its wards and candidates
          </Link>
        ) : null}
      </span>
    </p>
  );
}
