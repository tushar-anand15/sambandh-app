/**
 * The home page.
 *
 * The copy is GS's own, from pages 3-6 of the review deck, used verbatim. Two
 * typos are fixed and nothing else: "publically" reads "publicly", and "not
 * easy decipher" reads "not easy to decipher". His opening paragraph is whole
 * — an earlier draft split it across a display figure, which manufactured a
 * poster number out of a sentence that already had a source in it.
 *
 * Four blocks, in his order: the title and lede, how the records are made, what
 * joining them shows, and who the joined record answers to. Each block carries
 * a rail: an aside, ruled rather than boxed, holding the record the running
 * text is not holding. On the join block that is the Sakarma half, and it comes
 * from the same endpoint the meetings section reads.
 *
 * The one thing here that is not GS's writing is the colophon at the foot. The
 * ODbL requires the boundary attribution to travel with the data, and this page
 * carried the site's only copy of it before the rewrite.
 */

import { Link } from "react-router-dom";

import AmbooriParagraph from "@/components/home/AmbooriParagraph";

import styles from "@/components/home/home.module.css";

export default function HomeSection() {
  return (
    <div className="shell-container section-page">
      <div className={styles.block}>
        <h1>What Kerala&rsquo;s local governments plan, and what they spend</h1>
        <p className="lede">
          Understanding how Kerala&rsquo;s local governments work through data.
        </p>

        <p className={styles.prose}>
          India devolves a substantial share of its rural development spending to
          elected panchayats. The Fifteenth Finance Commission allocated
          &#8377;2.36 lakh crore to rural local bodies for 2021&ndash;26 (Report
          of the Fifteenth Finance Commission, 2021). Roughly 260,000 panchayats
          administer it for more than 800 million people.
        </p>
        <p className={styles.prose}>How each body decides its share is set by statute.</p>
        <p className={styles.prose}>
          Kerala law requires a local government to formulate its annual plan in
          open assembly, adopt each project by resolution of the elected council,
          and spend only against what was adopted.
        </p>
        <p className={styles.prose}>The sequence is a precondition of the expenditure.</p>
        <p className={styles.prose}>
          In this website we deconstruct this sequence. We present development
          project accounts, local council meeting records and election results
          for each of Kerala&rsquo;s 1,238 local governments and display them in
          an easy to read and digest format. Every table on this site can be
          downloaded.
        </p>

        <aside className={styles.rail}>
          <span className={styles.railKey}>The sequence Kerala law requires</span>
          <ol className={styles.railSteps}>
            <li>Formulate the annual plan in open assembly.</li>
            <li>Adopt each project by resolution of the elected council.</li>
            <li>Spend only against what was adopted.</li>
          </ol>
        </aside>
      </div>

      <div className={styles.block}>
        <h2>How do we do it</h2>
        <ul className={styles.points}>
          <li>
            Kerala records its development plan proposals and local council
            meetings in separate web portals.
          </li>
          <li>
            <a href="https://plan.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
              Sulekha
            </a>
            , the plan monitoring portal, holds what each body formulated and
            what it paid, 3.6 million projects since 2012&ndash;13.{" "}
            <a
              href="https://meeting.lsgkerala.gov.in"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sakarma
            </a>
            , the meeting portal, holds when each council sat and what it
            minuted, 443,000 meetings since 2015&ndash;16.
          </li>
          <li>
            Both Sulekha and Sakarma have always been publicly accessible. But
            they are not easy to decipher. Besides this, both the Sulekha and
            Sakarma systems contain information about the same local
            governments, but neither refers to the other in a meaningful manner.
          </li>
        </ul>

        <aside className={styles.rail}>
          <span className={styles.railKey}>What the two portals hold</span>
          <ul className={styles.railStats}>
            <li>
              <span className={styles.railFigure} data-numeric>
                3.6M
              </span>
              Sulekha projects, since 2012&ndash;13
            </li>
            <li>
              <span className={styles.railFigure} data-numeric>
                443K
              </span>
              Sakarma meetings, since 2015&ndash;16
            </li>
            <li>
              <span className={styles.railFigure} data-numeric>
                1,238
              </span>
              local governments
            </li>
          </ul>
        </aside>
      </div>

      <div className={styles.block}>
        <h2>What happens if we join the records?</h2>
        <p className={styles.prose}>
          Let&rsquo;s take Amboori Grama Panchayat&rsquo;s example. A local body
          located in Thiruvananthapuram district.
        </p>
        <AmbooriParagraph />
      </div>

      <div className={styles.block}>
        <h2>Who can use it?</h2>
        <ul className={styles.points}>
          <li>
            The Kerala Institute of Local Administration trains the officials who
            file these records, and the state local government department sets
            the terms they file under. The Union Ministry of Panchayati Raj sets
            the national reporting standards Kerala&rsquo;s portals answer to,
            through eGramSwaraj and Meri Panchayat. For each of them the joined
            record answers a question the portals separately cannot: how far a
            body&rsquo;s spending follows the plan its council adopted.
          </li>
          <li>
            Kerala&rsquo;s grama panchayats have about 25 million residents. The
            assembly that adopts the plan is open to all of them.
          </li>
        </ul>

        <aside className={styles.rail}>
          <span className={styles.railKey}>Who the records are filed by</span>
          Officials trained by KILA, under terms set by the state local
          government department, answering to national standards set by the Union
          Ministry of Panchayati Raj.
        </aside>
      </div>

      <p className={styles.colophon}>
        Projects and payments from{" "}
        <a href="https://plan.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
          Sulekha
        </a>
        , meetings from{" "}
        <a href="https://meeting.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
          Sakarma
        </a>
        , results from the{" "}
        <a href="https://www.sec.kerala.gov.in" target="_blank" rel="noopener noreferrer">
          Kerala State Election Commission
        </a>
        , ward boundaries for 2025 from{" "}
        <a href="https://wardmap.ksmart.live" target="_blank" rel="noopener noreferrer">
          KSMART
        </a>
        . Boundary maps for 2015 and 2020 are &copy; OpenStreetMap contributors,
        redistributed by{" "}
        <a
          href="https://github.com/opendatakerala/lsg-kerala-data"
          target="_blank"
          rel="noopener noreferrer"
        >
          opendatakerala
        </a>{" "}
        under the Open Database License 1.0.{" "}
        <Link to="/method">How the data was built</Link>.
      </p>
    </div>
  );
}
