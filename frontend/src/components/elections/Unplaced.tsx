/**
 * Bodies whose result exists and whose position does not.
 *
 * Two different absences end up here, and the page keeps them apart because a
 * reader should be able to tell them apart.
 *
 * Thirty-eight local bodies statewide contested the 2010 election and had no
 * successor: Kannur Municipality, Ettumanoor, Pattambi, Kondotty and thirty-four
 * others were absorbed into municipalities and corporations at the 2015
 * reorganisation. No boundary layer holds them, at any tier, for any cycle —
 * the earliest layer the build publishes is a November 2020 snapshot, by which
 * time they had been gone for five years. Their results are real and are
 * published here; there is simply nowhere on any map to put them. Eleven of
 * them are in Kannur alone, which is why this is a list under the map and not
 * a footnote.
 *
 * The second case is narrower: a body that does exist in the cycle but that
 * the layer being drawn holds no polygon for. Stated only where a map was
 * drawn, because a grid of squares claims no geography and so nothing can be
 * missing from it.
 *
 * Either way the result stays reachable. Being unmappable is not being
 * unpublished, and a body dropped from the map without a word would read as a
 * body that never existed.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";
import { electionsPath } from "./selection";

export interface UnplacedBody {
  lb_code: string;
  lb_name_en: string;
  lb_type: string;
}

interface UnplacedProps {
  label: string;
  explanation: string;
  bodies: UnplacedBody[];
  cycle: number;
}

export default function Unplaced({ label, explanation, bodies, cycle }: UnplacedProps) {
  if (bodies.length === 0) return null;

  return (
    <div className={styles.unplaced}>
      <p className={styles.unplacedLabel}>{label}</p>
      <p>{explanation}</p>
      <ul className={styles.unplacedList}>
        {bodies.map((body) => (
          <li key={body.lb_code}>
            <Link to={electionsPath({ cycle, lbCode: body.lb_code })}>
              {body.lb_name_en}
            </Link>{" "}
            <span className={styles.alongsideMeta}>{body.lb_type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
