/**
 * What the section serves, and what it does not.
 *
 * Sakarma publishes a decision register and minutes per meeting, and both open
 * from the list. Attachments are named in the manifest and are not served. The
 * endpoint carries the sentence, so the wording cannot drift between the API
 * and the page.
 */

import styles from "./meetings.module.css";

/** The endpoint's own wording, used when a payload is not to hand. */
export const SCOPE_NOTE =
  "Sakarma publishes a decision register and minutes for 420,561 of the " +
  "443,235 meetings in the manifest. Both open from the list below. PDF " +
  "attachments are named in the manifest and are not served here.";

export default function ScopeNote({ note }: { note?: string }) {
  return (
    <p className={styles.scopeNote} data-testid="scope-note">
      {note ?? SCOPE_NOTE}
    </p>
  );
}
