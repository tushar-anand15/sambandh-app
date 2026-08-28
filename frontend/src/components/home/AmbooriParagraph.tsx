/**
 * The worked example on the home page, read from the site's own endpoints.
 *
 * The paragraph links two tables — the finances year for Amboori 2023-24 and
 * the meeting register for the same year — and says what each of them holds.
 * Typed into the page, those figures are right until the next database build
 * and then wrong without saying so, while the tables a reader clicks through to
 * carry the new ones. The paragraph would be arguing against its own evidence.
 *
 * So it is fetched, from `/api/finances/{code}/{year}` and
 * `/api/meetings/{code}/{year}`, through the same two hooks the finances and
 * meetings sections use. Nothing here computes a figure the sections do not.
 *
 * The whole example is one unit: prose, bar and rail all render together or
 * none of them do. A sentence with a gap where a number should be is worse
 * than no sentence, and the rail restates the meeting counts the prose gives,
 * so a rail drawn from a payload the prose did not get would contradict it.
 *
 * Figures are rounded for prose as `docs/instructions.md` section 8 requires:
 * crore to two decimals, shares to one, and the exact rupee in the tables.
 */

import { useFinancesYear } from "@/components/finances/useFinances";
import { count, money } from "@/components/finances/format";
import { useMeetingsYear } from "@/components/meetings/useMeetingsYear";

import styles from "./home.module.css";

/** Amboori, Thiruvananthapuram: first grama panchayat in the alphabetical index. */
export const AMBOORI = "G01014";
export const YEAR = "2023-2024";

/** GS writes "per cent" in running text. One decimal, per section 8. */
function perCent(value: number): string {
  return `${value.toFixed(1)} per cent`;
}

/**
 * "a fifth", where the share is close enough to one to be worth the words.
 *
 * GS's sentence reads "spent a fifth of its plan". The fraction has to follow
 * the payload or the sentence is a hardcoded figure wearing a disguise, so it
 * is matched against the small fractions a reader has a name for and falls back
 * to the number where none is within a point and a half.
 */
function shareInWords(pct: number): string {
  const NAMED: [number, string][] = [
    [10, "a tenth"],
    [20, "a fifth"],
    [25, "a quarter"],
    [33.3, "a third"],
    [50, "half"],
    [66.7, "two thirds"],
    [75, "three quarters"],
  ];
  const near = NAMED.find(([value]) => Math.abs(pct - value) <= 1.5);
  return near ? `${near[1]} of its plan` : `${perCent(pct)} of its plan`;
}

export default function AmbooriParagraph() {
  const finances = useFinancesYear(AMBOORI, YEAR);
  const meetings = useMeetingsYear(AMBOORI, YEAR);

  if (finances.loading || meetings.status === "loading" || meetings.status === "idle") {
    return (
      <p className="selector-status" aria-busy="true">
        Reading Amboori&rsquo;s 2023&ndash;24 record from the two portals.
      </p>
    );
  }

  const year = finances.data;
  const held = meetings.status === "ready" ? meetings.payload : null;

  if (
    finances.error ||
    !year?.available ||
    year.projects === undefined ||
    year.formulation === undefined ||
    year.expense === undefined ||
    year.expense_pct === undefined ||
    !held
  ) {
    return (
      <p className="notice" role="alert">
        Amboori&rsquo;s figures did not load, so the example is not shown rather
        than shown half-stated. The same record is on{" "}
        <a href="/finances">Finances</a> and <a href="/meetings">Meetings</a>.
      </p>
    );
  }

  const spent = (year.expense / year.formulation) * 100;
  const withMinutes = held.meeting_rows.filter((row) =>
    row.documents.includes("minutes"),
  ).length;

  return (
    <>
      <p className={styles.prose}>
        Amboori grama panchayat in Thiruvananthapuram formulated{" "}
        {count(year.projects)} projects for 2023&ndash;24, worth{" "}
        {money(year.formulation)}, and spent {money(year.expense)} against them.
        That is {perCent(year.expense_pct)} of the planned amount. Its council sat{" "}
        {count(held.meetings)} times in the same year, {count(held.ordinary)}{" "}
        ordinary meetings and {count(held.special)} special ones, and published
        minutes for {count(withMinutes)} of them.
      </p>

      <svg
        data-chart="spend"
        className={styles.bar}
        viewBox="0 0 100 4"
        role="img"
        aria-label={`${money(year.expense)} spent of ${money(year.formulation)} planned`}
      >
        <rect
          x="0"
          y="0"
          width={Math.max(0, Math.min(100, spent))}
          height="4"
          className={styles.barFill}
        />
      </svg>
      <p className={styles.barScale}>
        <span>{money(year.expense)} spent</span>
        <span>{money(year.formulation)} planned</span>
      </p>

      <p className={styles.prose}>
        Amboori is the first grama panchayat in this site&rsquo;s alphabetical
        index, chosen for that reason and for no other. Both halves of the
        paragraph above are downloadable from the sections they came from.
      </p>
      <p className={styles.prose}>
        Sulekha alone gives the ratio and no account of the deliberation behind
        it. Sakarma alone gives the meetings and no account of what they
        authorised. The question of whether a council that met{" "}
        {count(held.meetings)} times spent {shareInWords(year.expense_pct)} is one
        that neither portal can be asked.
      </p>

      <aside className={`${styles.rail} ${styles.railJoin}`}>
        <span className={styles.railKey}>Sakarma &middot; the same year</span>
        <span className={styles.railFigure} data-numeric>
          {count(held.meetings)}
        </span>
        council meetings, {count(held.ordinary)} ordinary and {count(held.special)}{" "}
        special, with minutes published for {count(withMinutes)}. The text column
        is the half Sulekha holds; this is the half Sakarma holds.
      </aside>
    </>
  );
}
