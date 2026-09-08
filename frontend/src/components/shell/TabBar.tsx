import { NavLink } from "react-router-dom";

import styles from "./shell.module.css";

/**
 * Section navigation. It sits in the masthead and is the only part of it that
 * changes with the route.
 *
 * `end` on Home keeps it from matching every path, which is the failure mode
 * where two tabs read as current at once.
 */

const TABS = [
  { label: "Home", to: "/" },
  { label: "Finances", to: "/finances" },
  { label: "Meetings", to: "/meetings" },
  { label: "Elections", to: "/elections" },
  { label: "Assistant", to: "/ask" },
] as const;

export default function TabBar() {
  return (
    <nav className={styles.nav} aria-label="Sections">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/"}
          className={({ isActive }) =>
            isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
