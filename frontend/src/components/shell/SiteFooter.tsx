/**
 * Two names and where to reach them.
 *
 * The five source portals used to be listed here. They belong on the home page,
 * under "Where the records come from", where a reader deciding whether to trust
 * a figure will actually look — a footer is where attribution goes to be
 * ignored.
 *
 * Two names and nothing else. No institution, no funder, no partner: none of
 * those built this, and a logo in a footer reads as an endorsement whether or
 * not one was given.
 *
 * The domain is `gramsambandh.co.in`. `gramsambandh.in` does not resolve and
 * was linked here until 13 August 2026.
 */

import styles from "./shell.module.css";

/** Inline, because the site makes no external request for anything. */
function MailIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={styles.icon}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1" fill="none" stroke="currentColor" />
      <path d="M2 4.5 8 9l6-4.5" fill="none" stroke="currentColor" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={styles.icon}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" />
      <path d="M1.5 8h13M8 1.5a10 10 0 0 1 0 13a10 10 0 0 1 0-13" fill="none" stroke="currentColor" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={styles.icon}>
      <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" fill="none" stroke="currentColor" />
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`shell-container ${styles.footerInner}`}>
        <div className={styles.footerCol}>
          <h2 className={styles.footerHeading}>Gram Sambandh</h2>
          <p className={styles.footerText}>
            What Kerala&rsquo;s local governments planned, met about and spent,
            joined on one key and handed over in full.
          </p>
        </div>

        <div className={styles.footerCol}>
          <h2 className={styles.footerHeading}>Built by</h2>
          <p className={styles.names}>
            Abishek Choutagunta
            <br />
            Tushar Anand
          </p>
          <ul className={styles.links}>
            <li>
              <a href="mailto:csabishek@gmail.com">
                <MailIcon />
                csabishek@gmail.com
              </a>
            </li>
            <li>
              <a href="https://gramsambandh.co.in">
                <LinkIcon />
                gramsambandh.co.in
              </a>
            </li>
            <li>
              <a href="/method">
                <CodeIcon />
                How the data was built
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
