import BodySelector from "@/components/select/BodySelector";

/**
 * The Finances section.
 *
 * The heading, the lede and the selector come from the routing unit; the
 * figures below them belong to this section alone. Selection state lives in
 * the URL, so read it with the router rather than holding it here.
 *
 * Unit 7 fills this: the year series, the continuity panel and the project table.
 */
export default function FinancesSection() {
  return (
    <div className="shell-container section-page">
      <h1>Finances</h1>
      <p className="lede">
        What a local body planned and what it spent, year by year, from the Sulekha plan monitoring portal.
      </p>
      <BodySelector section="finances" />
    </div>
  );
}
