/**
 * The home page.
 *
 * The argument is the one in `docs/fellowship_proposal.md`, in the order that
 * document makes it: the scale of what panchayats spend, then the law that
 * requires the spending to be planned in the open, then the fact that Kerala
 * publishes both records and has never joined them, then who is left reading
 * neither.
 *
 * Every figure below is either sourced in the sentence that carries it or
 * computed by `CoverageTable` from `/api/bodies` and `/api/maps`. The counts in
 * prose are rounded, as `docs/instructions.md` section 8 requires; the exact
 * ones are in the table and in the CSV downloads each section offers.
 */

import { Link } from "react-router-dom";
import CoverageTable from "@/components/home/CoverageTable";

import styles from "@/components/home/home.module.css";

export default function HomeSection() {
  return (
    <div className="shell-container section-page">
      <h1>Kerala local government spending, and the meetings behind it</h1>
      <p className="lede">
        Projects, meetings and election results for the same panchayat, in one
        place. Every figure on this site can be downloaded.
      </p>

      <p>
        India has about 260,000 panchayats. They are the institutions through
        which more than 800 million rural citizens get essential public goods.
      </p>

      <p className={styles.figure} data-numeric>
        &#8377;2.36 lakh crore
      </p>
      <p className={styles.figureCaption}>
        allocated to rural local bodies for 2021&ndash;26 by the 15th Finance
        Commission (Report of the Fifteenth Finance Commission, 2021).
      </p>

      <h2>The plan comes before the money</h2>
      <p>
        Before a rupee is spent, the law requires citizens and their elected
        representatives to meet in open assembly and plan the work together.
        The assembly leaves a record. The spending leaves a record. Reading one
        against the other is how anyone outside the room finds out whether the
        two matched.
      </p>

      <h2>Kerala publishes both halves</h2>
      <p>
        <a href="https://plan.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
          Sulekha
        </a>{" "}
        holds 3.6 million projects, from
        2012&ndash;13 onward.{" "}
        <a href="https://meeting.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
          Sakarma
        </a>{" "}
        holds 443,000
        meetings, the earliest from 2015&ndash;16. The two portals name the same
        panchayat in two different ways, so until now the projects and the
        meetings could only be read one portal at a time. Here they sit under
        one name per local body.
      </p>

      <h2>What this site holds</h2>
      <CoverageTable />

      <h2>Who this is for</h2>
      <p>
        State local government departments set the terms of devolution and
        monitor whether they are met, and the Kerala Institute of Local
        Administration trains the officials who carry them out. Both work from
        the portals this site reads.
      </p>
      <p>
        The Union Ministry of Panchayati Raj coordinates the eGramSwaraj and
        Meri Panchayat platforms and sets the national reporting standards
        Kerala&rsquo;s own portals answer to.
      </p>
      <p>
        Kerala&rsquo;s grama panchayats have about 25 million residents. The
        assembly that plans the spending is theirs to attend.
      </p>

      <h2>Where the records come from</h2>
      <p>Five sources, all of them public.</p>
      <ul className={styles.sources}>
        <li>
          <a href="https://plan.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
            Sulekha
          </a>
          , the Kerala LSGD plan monitoring portal: the projects a local body
          planned and what it spent
        </li>
        <li>
          <a href="https://meeting.lsgkerala.gov.in" target="_blank" rel="noopener noreferrer">
            Sakarma
          </a>
          , the Kerala LSGD meeting portal: when each council met and what it
          wrote down
        </li>
        <li>
          <a href="https://www.sec.kerala.gov.in" target="_blank" rel="noopener noreferrer">
            Kerala State Election Commission
          </a>
          : candidates and results for four elections
        </li>
        <li>
          <a
            href="https://github.com/opendatakerala/lsg-kerala-data"
            target="_blank"
            rel="noopener noreferrer"
          >
            opendatakerala
          </a>
          : local body boundaries for 2015 and 2020
        </li>
        <li>
          <a href="https://wardmap.ksmart.live" target="_blank" rel="noopener noreferrer">
            KSMART ward maps
          </a>
          , Government of Kerala: ward boundaries for 2025
        </li>
      </ul>
      <p>
        Boundary maps for 2015 and 2020 are &copy; OpenStreetMap contributors,
        redistributed by opendatakerala under the Open Database License 1.0.{" "}
        <Link to="/method">How the data was built</Link>.
      </p>
    </div>
  );
}
