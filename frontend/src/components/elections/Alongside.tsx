/**
 * The municipalities and corporations of a district, listed beside the rural
 * tiers rather than inside them.
 *
 * They are not a level of the panchayat hierarchy and they are not below one.
 * A municipality has no block panchayat above it and no grama panchayats
 * inside it; it is an atomic body that happens to sit in the same district. So
 * when the map is showing block panchayats, the urban bodies are named next to
 * it rather than folded into it. Folding them in would inflate a block
 * panchayat's territory by ground no block panchayat governs.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";
import { controlSentence, frontToken, type FrontEntry } from "./payload";
import { electionsPath } from "./selection";

interface AlongsideProps {
  bodies: FrontEntry[];
  /** lb_code -> the English name, from the selector list. */
  nameOf: (lbCode: string) => string;
  cycle: number;
}

export default function Alongside({ bodies, nameOf, cycle }: AlongsideProps) {
  if (bodies.length === 0) return null;

  return (
    <div className={styles.alongside}>
      <p className={styles.alongsideLabel}>
        Municipalities and corporations, which sit in no block panchayat
      </p>
      <ul className={styles.alongsideList}>
        {bodies.map((body) => (
          <li key={body.lb_code}>
            <span
              className={styles.alongsideSwatch}
              style={{ backgroundColor: `var(--${frontToken(body.ruling_front)})` }}
              aria-hidden="true"
            />
            <Link to={electionsPath({ cycle, lbCode: body.lb_code })}>
              {nameOf(body.lb_code)}
            </Link>{" "}
            <span className={styles.alongsideMeta}>
              {body.lb_type}. {controlSentence(body.ruling_front, body.control_type)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
