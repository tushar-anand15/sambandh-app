/**
 * How much of Sakarma exists in each year.
 *
 * Sakarma's coverage grows year on year, so a small number in an early year is
 * a small portal, and the note states that once with the two figures that show
 * it.
 */

import styles from "./meetings.module.css";

export default function CoverageNote() {
  return (
    <p className={styles.rail} data-testid="coverage-note">
      Sakarma covers more local bodies every year: 8,989 meetings across 545
      local bodies in 2016&ndash;17, and 91,478 across 1,197 local bodies in
      2024&ndash;25.
    </p>
  );
}
