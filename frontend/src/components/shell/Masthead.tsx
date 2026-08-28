/**
 * The masthead: a newspaper nameplate at rest, a slim sticky bar on scroll.
 *
 * Four strips, top to bottom — a utility line carrying the theme control, the
 * nameplate with its banner and strapline, and the section bar. The first two
 * collapse together; the section bar is what remains, and it grows a small
 * wordmark and a second theme control to replace what went away.
 *
 * The laterite band that used to sit across the top is gone with the paddy
 * palette it belonged to. The Atlas of Urban Expansion separates a header from
 * its page with a single black rule, and so does this.
 *
 * Two rules govern when the nameplate is up:
 *
 *   1. The home page opens expanded. Every other route opens collapsed and
 *      never expands on its own — the nameplate is worth seeing on arrival and
 *      not worth re-reading on every navigation. The router's location decides
 *      it, so a pasted link to /finances paints collapsed on the first frame
 *      rather than expanding and then snapping shut.
 *
 *   2. The threshold has hysteresis. Collapsing removes the nameplate's height
 *      from the document, which moves the scroll position; a single threshold
 *      would push it back across the line and the header would flap. So it
 *      collapses past the nameplate's own height and re-expands only within
 *      12px of the top, and those two thresholds never overlap.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import TabBar from "./TabBar";
import ThemeToggle from "./ThemeToggle";
import useTheme from "./useTheme";
import styles from "./shell.module.css";

/** Re-expand only this close to the top. Below the collapse threshold, always. */
const TOP = 12;
/** Clear of the nameplate by this much before collapsing. */
const CLEARANCE = 20;

export default function Masthead() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const theme = useTheme();

  const [stuck, setStuck] = useState(() => !isHome);
  const nameplate = useRef<HTMLDivElement>(null);

  // Route changes decide the resting state outright. Anywhere but home that is
  // "collapsed"; on home it is "expanded unless the reader is already down the
  // page", which happens when the browser restores a scroll position.
  useEffect(() => {
    setStuck(!isHome || window.scrollY > TOP);
  }, [isHome, pathname]);

  // The listener exists on the home route only. Elsewhere there is nothing to
  // expand, so there is nothing to listen for.
  useEffect(() => {
    if (!isHome) return;

    const onScroll = () => {
      const y = window.scrollY;
      setStuck((current) => {
        if (!current) {
          // offsetHeight is the real nameplate height here, because `current`
          // being false is exactly the case where it is not clipped to zero.
          const plate = nameplate.current?.offsetHeight ?? 0;
          return y > plate + CLEARANCE;
        }
        return y >= TOP;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  return (
    <header
      className={stuck ? `${styles.site} ${styles.isStuck}` : styles.site}
      data-stuck={stuck ? "true" : "false"}
      data-testid="masthead"
    >
      <div className={styles.hdr}>
        <div className={styles.utility}>
          <ThemeToggle theme={theme} />
        </div>

        <div className={styles.nameplate} ref={nameplate} data-testid="nameplate">
          {/* The banner sits inside the nameplate so that one rule governs
              both: scroll away from the top and the whole masthead goes,
              banner included. Filled in by the banner unit; home route only. */}
          {isHome ? (
            <div className={styles.hero} data-testid="masthead-banner">
              {/* Two renders, one per theme, chosen from the resolved theme
                  rather than from CSS: an <img> carries the alt text, and the
                  hook already knows which theme is actually showing when the
                  reader has made no choice. Generated offline by
                  scripts/render_banner.py; see it for why this is not
                  prettymaps. */}
              <img
                className={styles.heroImage}
                src={`/banner-kerala-${theme.showing}.png`}
                width={2560}
                height={400}
                alt="Kerala's 1,033 local governments, drawn from their published boundaries and tilted about 15 degrees. Municipalities and corporations are the darker shapes."
              />
              <span className={styles.heroStamp}>
                1,033 local bodies &middot; &copy; OpenStreetMap contributors, ODbL
              </span>
            </div>
          ) : null}

          {/* The Malayalam is the same name again, so it is not part of the
              accessible name -- a screen reader should hear it once, which is
              what the aria-label on the link is for. */}
          <Link to="/" className={styles.name} aria-label="Gram Sambandh">
            <span className={styles.nameEn}>Gram Sambandh</span>
            <span className={styles.nameMal} lang="ml">
              ഗ്രാമ സംബന്ധ്
            </span>
          </Link>

          {/* SAMBANDH is an acronym. The eight letters that spell it are set in
              ink and the rest in grey, so the strapline reads the name out. */}
          <span className={styles.expansion} data-testid="strapline">
            <i>S</i>ystem for <i>A</i>nalysing <i>M</i>eetings and{" "}
            <i>B</i>udgets for <i>A</i>ccountable <i>N</i>eighbourhood{" "}
            <i>D</i>evelopment &amp; <i>H</i>yperlocal governance
          </span>
        </div>

        <div className={styles.sectionbar}>
          <span className={styles.smallmark} data-testid="wordmark">
            Gram Sambandh
          </span>
          <TabBar />
          <ThemeToggle theme={theme} inBar />
        </div>
      </div>
    </header>
  );
}
