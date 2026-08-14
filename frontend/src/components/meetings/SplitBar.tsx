/**
 * Two counts of the same total, drawn as one bar.
 *
 * The viewBox is 100 units wide and each segment takes its own percentage of
 * it, so the bar carries no pixel dimension at all: `svg[data-chart]` in
 * index.css sets the width and lets the height follow. A fixed pixel height
 * with `preserveAspectRatio="none"` would stretch the drawing horizontally and
 * make the two segments no longer read as parts of one hundred.
 *
 * The bar restates the numbers below it. It is not the only place they appear,
 * so a reader who cannot see it loses nothing.
 */

import styles from "./meetings.module.css";

interface SplitBarProps {
  /** The larger-in-meaning part, drawn in the accent. */
  major: number;
  minor: number;
  total: number;
  /** Read out in place of the drawing. */
  label: string;
}

export default function SplitBar({ major, minor, total, label }: SplitBarProps) {
  if (total <= 0) return null;

  const majorWidth = (major / total) * 100;
  const minorWidth = (minor / total) * 100;

  return (
    <svg
      data-chart="split"
      className={styles.bar}
      viewBox="0 0 100 4"
      role="img"
      aria-label={label}
    >
      <rect x="0" y="0" width={majorWidth} height="4" className={styles.barMajor} />
      <rect
        x={majorWidth}
        y="0"
        width={minorWidth}
        height="4"
        className={styles.barMinor}
      />
    </svg>
  );
}
