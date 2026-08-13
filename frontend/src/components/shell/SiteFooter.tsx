/**
 * Two names, their roles, and where to find them.
 *
 * The names, roles and links are exactly those the previous site carried, and
 * are the authors' own words about themselves — recovered from
 * `components/landing/About.tsx` rather than rewritten.
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
            What Kerala&rsquo;s local governments planned, met about and spent,
            joined on one key and handed over in full.
          </p>
          <p className={styles.footerText}>
            <a href="https://gramsambandh.co.in">gramsambandh.co.in</a>
            {" · "}
            <a href="mailto:csabishek@gmail.com">Contact</a>
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
    </footer>
  );
}
