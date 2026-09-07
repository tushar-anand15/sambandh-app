/**
 * Two names, their roles, where to find them, and what the data is licensed
 * under.
 *
 * The names, roles and links are exactly those the previous site carried, and
 * are the authors' own words about themselves — recovered from the About
 * section deleted in 5d02df4 rather than rewritten. How someone describes their
 * own work is not copy for this site to improve.
 *
 * The five source portals used to be listed here. They belong on the home page,
 * under "Where the records come from", where a reader deciding whether to trust
 * a figure will actually look; a footer is where attribution goes to be
 * ignored.
 *
 * No institution, funder or partner appears. None of those built this, and a
 * name in a footer reads as an endorsement whether or not one was given.
 *
 * The domain is `gramsambandh.co.in`. `gramsambandh.in` does not resolve and
 * was linked here until 13 August 2026.
 *
 * The contact address is the project's own, not a maintainer's personal inbox:
 * this repository is public, and a personal address in it is a permanent
 * scraping target. It is the site's only way to report a wrong figure until the
 * report form lands, which is why it is replaced here rather than removed.
 *
 * The ODbL line used to be a stamp under the masthead's Kerala banner. The
 * banner is gone; the boundary files it was drawn from are still served, and
 * the licence requires the attribution to travel with them.
 */

import { Github, Globe, Linkedin } from "lucide-react";

import styles from "./shell.module.css";

interface Author {
  name: string;
  role: string;
  links: { label: string; href: string; icon: typeof Globe }[];
}

const AUTHORS: Author[] = [
  {
    name: "Abishek Choutagunta",
    role: "Economist & Governance Researcher",
    links: [
      { label: "Website", href: "https://sites.google.com/view/csabishek/home", icon: Globe },
      {
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/abishekchoutagunta/",
        icon: Linkedin,
      },
    ],
  },
  {
    name: "Tushar Anand",
    role: "AI Engineer & NLP Researcher",
    links: [
      { label: "GitHub", href: "https://github.com/tushar-anand15", icon: Github },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/tushar-anand1594/", icon: Linkedin },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`shell-container ${styles.footerInner}`}>
        <div className={styles.footerCol}>
          <h2 className={styles.footerHeading}>Gram Sambandh</h2>
          <p className={styles.footerText}>
            What Kerala&rsquo;s local governments planned, met about and spent.
          </p>
          <p className={styles.footerText}>
            <a href="https://gramsambandh.co.in">gramsambandh.co.in</a>
            {" · "}
            <a href="mailto:contact@gramsambandh.co.in">Report an error</a>
          </p>
        </div>

        <div className={styles.footerCol}>
          <h2 className={styles.footerHeading}>Built by</h2>
          <div className={styles.authors}>
            {AUTHORS.map((author) => (
              <div key={author.name}>
                <p className={styles.authorName}>{author.name}</p>
                <p className={styles.authorRole}>{author.role}</p>
                <ul className={styles.authorLinks}>
                  {author.links.map(({ label, href, icon: Icon }) => (
                    <li key={href}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={label}
                        aria-label={`${author.name} on ${label}`}
                      >
                        <Icon size={15} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`shell-container ${styles.footerBase}`}>
        {/* SAMBANDH is an acronym. The eight letters that spell it are set in
            ink and the rest in grey, so the line reads the name out. */}
        <p className={styles.expansion} data-testid="strapline">
          <span className={styles.nameMal} lang="ml">
            &#x0d17;&#x0d4d;&#x0d30;&#x0d3e;&#x0d2e; &#x0d38;&#x0d02;&#x0d2c;&#x0d28;&#x0d4d;&#x0d27;&#x0d4d;
          </span>
          {" · "}
          <i>S</i>ystem for <i>A</i>nalysing <i>M</i>eetings and <i>B</i>udgets
          for <i>A</i>ccountable <i>N</i>eighbourhood <i>D</i>evelopment and{" "}
          <i>H</i>yperlocal governance
        </p>

        <p className={styles.licence}>
          Local body boundaries from{" "}
          <a href="https://opendatakerala.org/" target="_blank" rel="noopener noreferrer">
            opendatakerala
          </a>
          , derived from OpenStreetMap and redistributed under{" "}
          <a
            href="https://opendatacommons.org/licenses/odbl/1-0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ODbL 1.0
          </a>
          . &copy; OpenStreetMap contributors.
        </p>
      </div>
    </footer>
  );
}
