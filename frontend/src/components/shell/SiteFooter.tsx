/**
 * Attribution, contact, and the portals every figure on the site came from.
 *
 * Two names and nothing else. No institution, no funder, no partner: none of
 * those built this, and a logo in a footer is read as an endorsement whether or
 * not one was given.
 *
 * The OpenStreetMap line is a licence obligation rather than a courtesy. The
 * 2010, 2015 and 2020 boundary layers are ODbL, which requires attribution on
 * any redistribution, a rendered map included.
 *
 * The domain is `gramsambandh.co.in`. `gramsambandh.in` does not resolve and
 * was linked here until 13 August 2026.
 */

import styles from "./shell.module.css";

const SOURCES = [
  {
    label: "Sulekha, the Kerala LSGD plan monitoring portal",
    href: "https://plan.lsgkerala.gov.in",
  },
  {
    label: "Sakarma, the Kerala LSGD meeting portal",
    href: "https://meeting.lsgkerala.gov.in",
  },
  {
    label: "Kerala State Election Commission",
    href: "https://www.sec.kerala.gov.in",
  },
  {
    label: "opendatakerala, the Kerala local government boundary release",
    href: "https://github.com/opendatakerala/lsg-kerala-data",
  },
  { label: "KSMART ward maps, Government of Kerala", href: "https://wardmap.ksmart.live" },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`shell-container ${styles.footerInner}`}>
        <p className={styles.credit}>
          Gram Sambandh is built by Abishek Choutagunta and Tushar Anand.{" "}
          <a href="mailto:csabishek@gmail.com">csabishek@gmail.com</a>{" "}
          &middot;{" "}
          <a href="https://gramsambandh.co.in">gramsambandh.co.in</a>
        </p>

        <p>The records come from five sources, all of them public.</p>
        <ul className={styles.sources}>
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a href={source.href} target="_blank" rel="noopener noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>

        <p>
          Boundary layers for 2010, 2015 and 2020 are &copy; OpenStreetMap
          contributors, redistributed by opendatakerala under the Open Database
          License 1.0. <a href="/method">How the data was built</a>.
        </p>
      </div>
    </footer>
  );
}
