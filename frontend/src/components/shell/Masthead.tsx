/**
 * The masthead: one row, the same on every route.
 *
 * The mark and the wordmark at the left, the five section tabs next, then the
 * theme control and the account control at the right. Nothing collapses and
 * nothing measures itself, so the header is the same height on the first frame
 * as on the thousandth.
 *
 * What was here before was a newspaper nameplate that folded away on scroll.
 * It worked, but it cost a scroll-anchoring suppression, a hand-written easing
 * curve that had to stay in step with the stylesheet, and a re-expand gesture
 * that could not use scroll position as its signal. The failure it was written
 * to avoid is worth recording even though the mechanism is gone: a large
 * element leaving the document at the top of a page makes the browser spend
 * scroll to hold the content still, and when the scroll budget runs out before
 * the element has finished leaving, the page sits still and then lurches. A
 * fixed-height header never gets near that.
 *
 * The account control (R8c) and the narrow-viewport behaviour (R8d) are not
 * drawn on the design canvas. Both are inventions built to its idiom.
 */

import { Link } from "react-router-dom";

import Logo from "./Logo";
import TabBar from "./TabBar";
import ThemeToggle from "./ThemeToggle";
import useTheme from "./useTheme";
import { useAuth } from "@/hooks/useAuth";
import styles from "./shell.module.css";

/**
 * The signed-in state, or null where there is no provider above this header.
 *
 * `useAuth` throws without an `AuthProvider`, and the masthead is chrome: it is
 * rendered on its own by the copy tests, and a header that throws there would
 * fail a test about wording with a stack trace about context. The `useContext`
 * call inside `useAuth` runs unconditionally, so hook order is the same on
 * every render whichever way this returns. No provider means signed out.
 */
function useAuthIfPresent(): ReturnType<typeof useAuth> | null {
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export default function Masthead() {
  const theme = useTheme();
  const auth = useAuthIfPresent();
  const signedIn = Boolean(auth?.token);

  return (
    <header className={styles.site} data-testid="masthead">
      <div className={styles.hdr}>
        {/* The Malayalam second name used to sit under this one. A single row
            has no space for a stacked name, so it moved to the footer rather
            than off the site (R8b). */}
        <Link to="/" className={styles.brand} aria-label="Gram Sambandh">
          <Logo size={22} />
          <span className={styles.wordmark} aria-hidden="true">
            Gram<b>SAMBANDH</b>
          </span>
        </Link>

        <TabBar />

        <div className={styles.controls}>
          <ThemeToggle theme={theme} />

          {signedIn ? (
            // Saved questions are the only thing an account buys on this site,
            // so the account control is a way back to them and a way out.
            <div className={styles.account} data-testid="account">
              <Link to="/ask" className={styles.accountLink}>
                Saved questions
              </Link>
              <button
                type="button"
                className={styles.signin}
                onClick={auth?.logout}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/login" className={styles.signin} data-testid="signin">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
