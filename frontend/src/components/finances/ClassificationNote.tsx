/**
 * What this section does not have.
 *
 * Sulekha publishes a project number, a name and two amounts. It publishes no
 * sector, sub-sector or category, and nothing downstream of it invents one. A
 * page that quietly omitted the sector split would leave every reader who
 * expected one to assume it was an oversight, so the absence is printed at the
 * same size as the figures, in a bordered block, once.
 *
 * The wording comes from the endpoint's own `classification_note` where a
 * payload is on screen, so the page and the API say the same sentence.
 */

/** The endpoint's sentence, for the state before a body is chosen. */
export const DEFAULT_NOTE =
  "Sulekha publishes no sector or category for a project, and none is inferred here.";

interface ClassificationNoteProps {
  /** `classification_note` from the payload, where one has loaded. */
  note?: string;
}

export default function ClassificationNote({ note }: ClassificationNoteProps) {
  return (
    <aside
      className="mt-s7 border border-rule-2 p-s5"
      aria-labelledby="classification-heading"
      data-testid="classification-note"
    >
      <h2 id="classification-heading">No sector classification is published</h2>
      <p>{note ?? DEFAULT_NOTE}</p>
      <p>
        This section therefore draws no split of spending by sector. Any such
        chart would be built from a classification nobody published.
      </p>
    </aside>
  );
}
