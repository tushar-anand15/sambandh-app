/**
 * Five counts of the site's scale, each naming what it counts.
 *
 * The population is on the page beside every figure because 1,033, 1,199 and
 * 1,238 are all correct counts of Kerala's local governments: 941 grama
 * panchayats + 86 municipalities + 6 corporations divide the ground between
 * them and are 1,033; the 152 block and 14 district panchayats elected over
 * the same ground again bring the bodies that contest to 1,199; and the master
 * list holds 1,238, the extra 39 being bodies that no longer contest. A bare
 * "1,033 local governments" would be a figure with three defensible readings.
 *
 * The seat count is read from the Commission's own record for 2020 rather than
 * typed, which is R17: the State Election Commission is the denominator, not
 * the KSMART ward extract the design canvas counted. The other four are a
 * snapshot of one build, and the line under the strip names its date, because
 * an unlabelled figure here would contradict a section page tomorrow without
 * saying which of the two moved.
 */

import { formatCount } from "@/components/elections/payload";
import type { StatewideState } from "@/components/elections/useStatewide";

import styles from "./home.module.css";

/** The cycle the whole page is set to. The worked example is a 2020 result. */
export const STRIP_CYCLE = 2020;

/**
 * The design canvas's own figures, from the build it was synced against.
 * Named and dated here rather than inline, so a figure on this page can always
 * be told from a figure the API answered with.
 */
export const SNAPSHOT_DATE = "4 September 2026";
const SNAPSHOT = {
  seats: 21820,
  wards: 20962,
};

interface Stat {
  value: string;
  label: string;
  /** What the count is a count of. Never left to be inferred. */
  of: string;
}

export default function StatStrip({ statewide }: { statewide: StatewideState }) {
  const live =
    statewide.status === "ready" && statewide.payload.available
      ? statewide.payload
      : null;

  const seats = live?.seats_total ?? SNAPSHOT.seats;
  const wards = live?.wards_counted ?? SNAPSHOT.wards;
  const bodies = live?.bodies_with_result ?? 1199;

  const stats: Stat[] = [
    {
      value: formatCount(seats),
      label: `Ward seats filled at the ${STRIP_CYCLE} election`,
      of: `across the ${formatCount(bodies)} local governments that contested it`,
    },
    {
      value: "1,033",
      label: "Local governments in the first tier",
      of: "941 grama panchayats, 86 municipalities and 6 corporations. 152 block and 14 district panchayats are elected over the same ground again.",
    },
    {
      value: "3.6 million",
      label: "Spending proposals",
      of: "filed in Sulekha by all 1,199 contesting bodies since 2012–13",
    },
    {
      value: "455,000+",
      label: "Local council sittings",
      of: "published in Sakarma by all 1,199 contesting bodies since 2015–16",
    },
    {
      value: "915",
      label: "Wards won by under 10 votes",
      of: `of the ${formatCount(wards)} wards with a published ward result in ${STRIP_CYCLE}`,
    },
  ];

  return (
    <section className={styles.strip} aria-label="What this site holds">
      <ul className={styles.stripList}>
        {stats.map((stat) => (
          <li key={stat.label} className={styles.stripItem}>
            <span className={styles.stripValue} data-numeric>
              {stat.value}
            </span>
            <span className={styles.stripLabel}>{stat.label}</span>
            <span className={styles.stripOf}>{stat.of}</span>
          </li>
        ))}
      </ul>
      <p className={styles.stripSource}>
        {live
          ? `Seats and wards are read from the Commission's ${STRIP_CYCLE} record. The other three counts are a snapshot of the build published on ${SNAPSHOT_DATE}.`
          : `The Commission's ${STRIP_CYCLE} totals did not load, so every count here is a snapshot of the build published on ${SNAPSHOT_DATE}.`}
      </p>
    </section>
  );
}
