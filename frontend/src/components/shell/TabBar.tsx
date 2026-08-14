import { NavLink } from "react-router-dom";

/**
 * Section navigation, and the only sticky element on the site.
 *
 * One sticky bar is a wayfinding aid; two are a shrinking window. The masthead
 * scrolls away deliberately so that on a phone the reader keeps most of the
 * viewport for the table they came to read.
 *
 * The destinations are declared here; the routes that answer them land in
 * Unit 6. A tab pointing at a route that does not exist yet is a dead link for
 * one unit, which is preferable to the tab bar being rewritten once routing
 * arrives.
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
    <nav className="tabbar" aria-label="Sections">
      <div className="shell-container tabbar-inner">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              isActive ? "tab tab-active" : "tab"
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
