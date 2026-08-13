/**
 * What the register holds that this release does not publish.
 *
 * Sakarma publishes a decision register and attachments for each meeting. This
 * page counts meetings and does not report what was decided in them, and the
 * endpoint carries the sentence that says so, so the wording cannot drift
 * between the API and the page. No date is offered, because none is fixed.
 */

import styles from "./meetings.module.css";

/** The endpoint's own wording, used when a payload is not to hand. */
export const SCOPE_NOTE =
  "Sakarma's decision registers and meeting attachments are published but not " +
  "yet parsed, so this page shows meeting metadata only.";

export default function ScopeNote({ note }: { note?: string }) {
  return (
    <p className={styles.scopeNote} data-testid="scope-note">
      {note ?? SCOPE_NOTE}
    </p>
  );
}
