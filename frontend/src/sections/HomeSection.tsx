/**
 * The home page.
 *
 * It opens on one local government rather than on an argument. The page it
 * replaced ran four blocks of prose from the review deck and asked a reader who
 * had just arrived to go and find a panchayat; a reader who did not already
 * care about Kerala local government had nothing to look at. That copy is not
 * deleted — the statutory sequence is the reason joining Sulekha and Sakarma
 * means anything — it moves to `/method`, which is the one page where its
 * first-person plural is allowed to run unaltered.
 *
 * What stands here instead, top to bottom: the hero and the ask card, five
 * counts of the site's scale, Amboori grama panchayat in three numbered
 * panels, the same election read across the whole state, and the ask card
 * again.
 *
 * The ask card is the only gate on the page and the only gate on the site.
 * Every table, chart, map and download answers without an account; the
 * assistant does not, because each question spends model tokens. The three
 * sample questions under the card are anchors into this same page, so the
 * claim that they need no account is one the page keeps rather than makes.
 *
 * The statewide block and the worked example are both set to 2020. They are
 * two readings of one election, and letting them drift to different cycles
 * would put two answers to the same question on one screen.
 */

import { Link } from "react-router-dom";

import StatewideBlock from "@/components/elections/StatewideBlock";
import { useStatewide } from "@/components/elections/useStatewide";
import AskCard from "@/components/home/AskCard";
import StatStrip from "@/components/home/StatStrip";
import WorkedExample, { EXAMPLE_CYCLE } from "@/components/home/WorkedExample";

import styles from "@/components/home/home.module.css";

export default function HomeSection() {
  const statewide = useStatewide(EXAMPLE_CYCLE);

  return (
    <div className="shell-container section-page">
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className="page-headline">Explore local government activity</h1>
          <p className="lede">
            Kerala&rsquo;s local governments plan, deliberate and spend money for
            the delivery of public goods and services at the ward level. The
            documents that record these actions are stored in different portals
            of the Kerala Local Self Government. GramSAMBANDH connects those
            portals into one picture of local government activity.
          </p>
          <p className={styles.heroActions}>
            <a href="#amboori" className={styles.primary}>
              Start with one local government
            </a>
          </p>
        </div>

        <AskCard idPrefix="hero" samples />
      </div>

      <StatStrip statewide={statewide} />

      <WorkedExample />

      <div className={styles.statewide}>
        <StatewideBlock
          cycle={EXAMPLE_CYCLE}
          heading={`The same election across Kerala, ${EXAMPLE_CYCLE}`}
          controlId="statewide-control"
          marginsId="statewide-margins"
        />
      </div>

      <div className={styles.closing}>
        <h2 className="section-head">Ask about any local government</h2>
        <p className={styles.closingLede}>
          The record above is one body of 1,238. The assistant reads the same
          three portals for any of them, one question at a time.
        </p>
        <AskCard idPrefix="closing" />
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
