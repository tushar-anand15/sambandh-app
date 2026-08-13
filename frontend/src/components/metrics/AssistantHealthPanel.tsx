/**
 * The share of assistant answers that were refusals for being out of index.
 *
 * This is the one number on the page that is an argument rather than a count.
 * The assistant holds Thrissur project documents and refuses anything outside
 * them. A refusal is not a fault: it is a reader asking about a body the corpus
 * does not hold. If the share climbs, the corpus is the thing that is wrong,
 * and extending the ingest beyond Thrissur is the answer.
 *
 * With no answers at all the share is stated as unknown. Drawing 0% for a
 * denominator of zero would be a claim nobody has the data to make.
 */

import type { AssistantHealth } from "./types";

export function sharePercent(share: number | null): string {
  return share === null ? "—" : `${(share * 100).toFixed(1)}%`;
}

export default function AssistantHealthPanel({ health }: { health: AssistantHealth }) {
  return (
    <section aria-labelledby="assistant-heading">
      <h2 id="assistant-heading">Assistant scoping</h2>

      <dl data-testid="assistant-health">
        <dt className="label">Answers</dt>
        <dd>{health.answers}</dd>

        <dt className="label">Refused as out of index</dt>
        <dd>{health.out_of_index_refusals}</dd>

        <dt className="label">Share refused</dt>
        <dd>{sharePercent(health.out_of_index_share)}</dd>
      </dl>

      {health.answers === 0 ? (
        <p className="notice">
          The assistant has answered nothing yet, so there is no share to report.
        </p>
      ) : (
        <p className="source-line">
          Counted by matching the refusal wording in the assistant's answers. A
          rising share means readers are asking about local bodies outside
          Thrissur, which the corpus does not hold.
        </p>
      )}
    </section>
  );
}
