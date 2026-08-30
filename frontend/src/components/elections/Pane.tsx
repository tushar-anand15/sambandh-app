/**
 * One chapter of the drill.
 *
 * A selection appends a pane below the one it was made in and leaves every
 * pane above it on screen and live, so going back up a level is a scroll
 * rather than a click that throws the level away. The rail down the left is
 * where the reader is: read the rail labels down the page and they are the
 * breadcrumb, each one a link to the address that opens at that level.
 *
 * A pane holds three things and no others: where it sits, what it is, and its
 * own result. Anything else on it would be the layout explained back to the
 * reader.
 */

import { Link } from "react-router-dom";
import type { ReactNode } from "react";

import styles from "./elections.module.css";

export interface Crumb {
  label: string;
  /** Absent where this is the level the reader is on. */
  to?: string;
}

interface PaneProps {
  id: string;
  /**
   * The rail label. Absent on a pane that opens at the same level as the one
   * above it: a district's block panchayats and its grama panchayats are both
   * "Thrissur", and saying so twice says nothing the second time.
   */
  crumb?: Crumb;
  heading: string;
  /** The first pane carries the page's heading; the rest are sections of it. */
  top?: boolean;
  /** The result of the body this pane was opened by, where it has one. */
  result?: ReactNode;
  /** Where the cycle has taken a level away, this says which and why. */
  foot?: ReactNode;
  children?: ReactNode;
}

export default function Pane({
  id,
  crumb,
  heading,
  top = false,
  result,
  foot,
  children,
}: PaneProps) {
  const Heading = top ? "h1" : "h2";

  return (
    <section id={id} className={styles.pane} aria-label={heading}>
      <div className={styles.paneRail}>
        {crumb ? (
          crumb.to ? (
            <Link className={styles.crumb} to={crumb.to}>
              {crumb.label}
            </Link>
          ) : (
            <span className={styles.crumb} aria-current="page">
              {crumb.label}
            </span>
          )
        ) : null}
      </div>

      <div className={styles.paneBody}>
        <Heading className={styles.paneHeading}>{heading}</Heading>
        {result}
        {children}
        {foot}
      </div>
    </section>
  );
}
