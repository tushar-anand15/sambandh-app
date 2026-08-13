/**
 * Everyone who stood in the selected ward.
 *
 * It renders under the ward table rather than in place of it, so clicking down
 * the wards of a body never costs the list of wards. The rows come from the
 * body's own payload, which carries every candidate of every ward, so a click
 * on a ward is a filter and not a request.
 *
 * The margin column reads from the winner: the winner's own margin is over the
 * runner-up, and every other candidate's is how far behind the winner they
 * finished. That is the same number the ward table's margin column carries, cut
 * per candidate.
 */

import styles from "./elections.module.css";
import {
  candidateName,
  formatCount,
  frontToken,
  wardLabel,
  type CandidateRow,
  type WardRow,
} from "./payload";

interface CandidatesTableProps {
  /** Already filtered to one ward and sorted by votes. */
  candidates: CandidateRow[];
  ward: WardRow | null;
  cycle: number;
}

/** The winner's votes, which every margin in the table is measured against. */
function winningVotes(candidates: CandidateRow[]): number | null {
  const won = candidates.find((candidate) => candidate.status === "won");
  return (won ?? candidates[0])?.votes ?? null;
}

function marginOf(candidate: CandidateRow, candidates: CandidateRow[]): string {
  const winner = winningVotes(candidates);
  if (candidate.votes === null || winner === null) return "—";
  if (candidate.votes === winner) {
    const next = candidates.find((other) => other !== candidate)?.votes;
    if (next === null || next === undefined) return "Uncontested";
    return `+${formatCount(winner - next)}`;
  }
  return `−${formatCount(winner - candidate.votes)}`;
}

export default function CandidatesTable({
  candidates,
  ward,
  cycle,
}: CandidatesTableProps) {
  if (!ward) {
    return (
      <section aria-label="Candidates">
        <h2>Candidates</h2>
        <p className={styles.layerMeta}>
          No ward is selected. A ward chosen on the map or in the table above lists its
          candidates here.
        </p>
      </section>
    );
  }

  // The body is named by the ward table directly above this one, so the title
  // names the ward and the cycle and stops.
  const title = `Candidates in ${wardLabel(ward)}, ${cycle}`;

  if (candidates.length === 0) {
    return (
      <section className={styles.swap} aria-label={title}>
        <h2>{title}</h2>
        <p className={styles.layerMeta} role="status">
          The commission published no candidate rows for this ward in the {cycle} cycle.
          The winner and the runner-up are in the card above.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.swap} aria-label={title}>
      <h2>{title}</h2>
      <p className={styles.layerMeta}>
        {formatCount(candidates.length)} candidates stood, of{" "}
        {formatCount(ward.valid_votes)} valid votes.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table} aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Party</th>
              <th scope="col" className={styles.numeric}>
                Votes
              </th>
              <th scope="col" className={styles.numeric}>
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => (
              <tr key={`${candidate.candidate_name ?? index}-${index}`}>
                <td>{candidateName(candidate)}</td>
                <td className={styles.nowrap}>
                  <span
                    className={styles.partyDot}
                    style={{ backgroundColor: `var(--${frontToken(candidate.front)})` }}
                  />
                  {candidate.party ?? <span className={styles.absent}>Not stated</span>}
                  {candidate.front ? ` (${candidate.front})` : ""}
                </td>
                <td className={styles.numeric}>{formatCount(candidate.votes)}</td>
                <td className={styles.numeric}>{marginOf(candidate, candidates)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.layerMeta}>
        The margin is votes behind the winner. The winner's own margin is over the
        runner-up.
      </p>
    </section>
  );
}
