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

import CoverageTable from "@/components/home/CoverageTable";

import styles from "@/components/home/home.module.css";

export default function HomeSection() {
  return (
    <div className="shell-container section-page">
      <h1>Kerala local government spending, and the meetings behind it</h1>
      <p className="lede">
        Two state portals publish what Kerala&rsquo;s local bodies planned and
        what they met about. This site holds both, joined by a single key, and
        hands over every figure it shows.
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
        Sulekha (plan.lsgkerala.gov.in) holds 3.6 million project records, from
        2012&ndash;13 onward. Sakarma (meeting.lsgkerala.gov.in) holds 443,000
        meeting records, the earliest of them from 2015&ndash;16. The
        two portals identify a local body in different ways and have never
        shared a key, so nobody could ask what a council discussed and what it
        then paid for. This site is built on a reconciliation of the two, and
        every project row and every meeting row in it resolves to one local
        body.
      </p>
      <p>
        Kerala&rsquo;s local bodies are constitutionally empowered and fiscally
        dependent. The law requires them to deliberate before they spend, and
        that record has sat unread behind a portal that returns one meeting at
        a time.
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
        Kerala&rsquo;s grama panchayats have about 25 million residents. They
        are the people present or absent at the assembly that plans the
        spending, and their access to information about their own local
        government has been opaque.
      </p>
    </div>
  );
}
