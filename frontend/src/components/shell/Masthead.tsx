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
 *   2. It collapses on the first scroll, and re-expands only when the reader
 *      asks for it back.
 *      An earlier version waited until the reader had cleared the nameplate's
 *      own height before collapsing, which on the home route means scrolling
 *      past a 400px banner first -- the whole nameplate stayed up through the
 *      opening of the page it was supposed to get out of the way of.
 *
 *      The nameplate leaving takes ~500px out of the document, and the reader
 *      is only ~40px down, so the two do not cancel: the content has to move
 *      about 405px whatever happens. What is left to decide is whether it
 *      moves as one gesture or in two.
 *
 *      Left alone it moves in two, and badly. The browser's scroll anchoring
 *      holds the content still by spending scroll -- 40, 39, 37, 34, 30, 24,
 *      16 -- then reaches 0 with 445px of collapse still to run and nothing
 *      left to absorb it. The page sits still, then lurches. So anchoring is
 *      turned off for the duration and the scroll is animated to 0 on the same
 *      clock and the same curve as the height, which makes the whole thing one
 *      even movement.
 *
 *      `runCollapse` and the CSS must therefore agree on both. They do it by
 *      sharing easeOutCubic, which is exactly cubic-bezier(.215,.61,.355,1) --
 *      change one and the content will accelerate against itself.
 *
 *      Ending at scrollY 0 also means scroll position cannot be the signal for
 *      re-expanding: an earlier version read the 0 as "back at the top",
 *      re-opened the nameplate, and put the page where it started. Coming back
 *      is a gesture instead, an upward wheel or drag once already at the top.
 *      Nothing the collapse does can imitate that.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import TabBar from "./TabBar";
import ThemeToggle from "./ThemeToggle";
import useTheme from "./useTheme";
import styles from "./shell.module.css";

/** Enough scroll to be a scroll rather than a stray wheel tick or a bounce. */
const COLLAPSE = 8;
/** Enough upward gesture at the top to be a request for the nameplate back. */
const PULL = 60;
/** Matches --hdr-time in shell.module.css. */
const COLLAPSE_MS = 620;
/** Close enough to the top for an upward gesture to mean "bring it back". */
const TOP_BAND = 4;

/** easeOutCubic, the JS half of cubic-bezier(0.215, 0.61, 0.355, 1). */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Take the scroll to 0 on the same clock as the height.
 *
 * Scroll anchoring is suspended while this runs, because otherwise the browser
 * is adjusting the position at the same time and against a different curve.
 */
function runCollapse() {
  const root = document.documentElement;
  const from = window.scrollY;
  if (from === 0) return;

  const previousAnchor = root.style.overflowAnchor;
  root.style.overflowAnchor = "none";

  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / COLLAPSE_MS);
    window.scrollTo(0, from * (1 - easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(step);
    else root.style.overflowAnchor = previousAnchor;
  };
  requestAnimationFrame(step);
}

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
    setStuck(!isHome || window.scrollY > COLLAPSE);
  }, [isHome, pathname]);

  // The listener exists on the home route only. Elsewhere there is nothing to
  // expand, so there is nothing to listen for.
  useEffect(() => {
    if (!isHome) return;

    // Collapsing is the scroll position's business. Expanding is not.
    const onScroll = () => {
      if (window.scrollY <= COLLAPSE) return;
      setStuck((current) => {
        // Only on the transition, so a second scroll event mid-animation does
        // not restart the run and stall the scroll at a fraction of the way.
        if (!current) runCollapse();
        return true;
      });
    };

    // A gesture, not a position. `pull` accumulates upward movement made while
    // already at the top and resets on anything else, so an overscroll bounce
    // or a single stray tick does not reach the threshold.
    let pull = 0;
    const askedForItBack = (delta: number) => {
      if (window.scrollY > TOP_BAND) {
        pull = 0;
        return;
      }
      pull = delta < 0 ? pull - delta : 0;
      if (pull > PULL) {
        pull = 0;
        setStuck(false);
      }
    };

    const onWheel = (e: WheelEvent) => askedForItBack(e.deltaY);

    let lastTouch: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouch = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y == null || lastTouch == null) return;
      askedForItBack(lastTouch - y);
      lastTouch = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
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
