/**
 * The one gate on the home page.
 *
 * The assistant sits behind an account because each question spends model
 * tokens and an open route has no ceiling on that. Every table, chart, map and
 * download on this site answers without one, and the card says so rather than
 * leaving a reader to assume the whole site is walled.
 *
 * The input is drawn locked and is not an input. A real disabled field would
 * be the largest target on the card and would do nothing when clicked, which
 * teaches a reader that the card is broken; this is a link wearing the shape of
 * a field, so a click and a focus both land on the sign-in page.
 *
 * The three questions under it are the opposite claim, and they have to be
 * true. Each is an anchor into a section of this same page that answers it —
 * the worked example, the council-control table, the margin bands — so nothing
 * here routes to a login and nothing here is a chat prompt carried through one.
 *
 * The canvas's copy addressed the reader directly twice. `docs/instructions.md`
 * section 11 allows that only in a method note, so the sub-heading and the
 * questions heading are reworded and the claim each made is kept.
 */

import { Link, useNavigate } from "react-router-dom";

import styles from "./home.module.css";

interface AskCardProps {
  /** The hero card carries the three public questions; the closing one repeats
   *  the gate alone, so it does not offer the same three anchors twice. */
  samples?: boolean;
  /** Distinguishes the hero card's controls from the closing card's. */
  idPrefix: string;
}

/** Where each public question is answered, on this page, with no account. */
export const PUBLIC_QUESTIONS = [
  { label: "Show me one panchayat in full", href: "#amboori" },
  { label: "Which councils are hung?", href: "#statewide-control" },
  { label: "Which wards were won by under 50 votes?", href: "#statewide-margins" },
];

/** A closed padlock. Decorative: the link beside it carries the words. */
function Padlock() {
  return (
    <svg
      className={styles.padlock}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function AskCard({ samples = false, idPrefix }: AskCardProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.ask}>
      <h2 className={styles.askHead}>Ask questions of the record</h2>
      <p className={styles.askLede}>
        The assistant answers questions about one local government: its election
        results, its plan and payments, and what its council minuted. Each
        question spends model tokens, so it is the one thing here that needs an
        account.
      </p>

      <Link
        to="/login"
        className={styles.lock}
        data-testid={`${idPrefix}-locked-field`}
        aria-label="Sign in to ask a question"
        // R10: the locked field is the largest target on the card, so it takes
        // the reader to the sign-in page on a click and on a focus rather than
        // sitting inert under the pointer.
        onFocus={() => navigate("/login")}
      >
        <Padlock />
        <span className={styles.lockText}>
          Who won ward 8 in Amboori, and by how much?
        </span>
      </Link>

      <div className={styles.askActions}>
        <Link to="/login" className={styles.primary}>
          Sign in to ask
        </Link>
        <Link to="/register" className={styles.secondary}>
          Create an account
        </Link>
      </div>

      {samples ? (
        <>
          <p className={styles.askNote}>These three need no account</p>
          <ul className={styles.samples}>
            {PUBLIC_QUESTIONS.map((question) => (
              <li key={question.href}>
                <a href={question.href} className={styles.sample}>
                  {question.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
