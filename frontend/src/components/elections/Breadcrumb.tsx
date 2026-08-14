/**
 * The way back out of the map.
 *
 * Every crumb is a link to an address that restores that level with the cycle
 * intact, so stepping back from a ward to its district is a navigation the
 * back button also performs.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";

export interface Crumb {
  label: string;
  /** Absent on the last crumb: it is where the reader already is. */
  to?: string;
}

export default function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Map level">
      <ol className={styles.breadcrumb}>
        {crumbs.map((crumb, index) => (
          <li key={crumb.label}>
            {index > 0 ? (
              <span className={styles.crumbSeparator} aria-hidden="true">
                /{" "}
              </span>
            ) : null}
            {crumb.to ? (
              <Link to={crumb.to}>{crumb.label}</Link>
            ) : (
              <span className={styles.breadcrumbHere} aria-current="page">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
