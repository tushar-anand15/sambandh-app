/**
 * The form behind "Report an error" in the footer.
 *
 * What it sends is a subject, a message and a signed timestamp the API issued
 * when this dialog opened. Nothing is stored on the server: the report is
 * handed to a mail service and the outcome is shown here, so a report that
 * fails to send says so on the screen of the person who wrote it rather than
 * landing in a table nobody reads.
 *
 * Three things guard the form, and none of them is a captcha vendor. The site
 * makes no external requests (`index.css` states that as a property), and a
 * third party would be the first. Instead: a honeypot field that is off-screen
 * and out of the accessibility tree, so only a form-filling script finds it; a
 * timestamp the API signs, so the age of the form cannot be edited in the
 * browser; and the API's own rate limit.
 *
 * The success line says the mail service accepted the report. It does not say
 * the report arrived, because no request here can know that.
 */

import { useEffect, useRef, useState } from "react";

import api from "@/lib/api";
import styles from "./shell.module.css";

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Token {
  issued_at: number;
  signature: string;
}

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 4000;

const SEND_FAILED = "The report did not send. Try again in a few minutes.";
const TOKEN_FAILED = "The form could not be prepared. Reload the page and open it again.";

/** The focusable controls inside the panel, in the order a Tab walks them. */
function focusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, [href], input:not([tabindex="-1"]), textarea, select',
    ),
  ).filter((el) => !el.hasAttribute("disabled"));
}

export default function ReportDialog({ open, onClose }: ReportDialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // The honeypot. A person never sees this field and never tabs into it.
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<Token | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening is what fetches the timestamp, so the 15-minute window starts when
  // the form appears rather than when the page loaded.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    setSubject("");
    setMessage("");
    setWebsite("");
    setSent(false);
    setError(null);
    setToken(null);

    let live = true;
    api
      .get<Token>("/report/token")
      .then(({ data }) => {
        if (live) setToken(data);
      })
      .catch(() => {
        if (live) setError(TOKEN_FAILED);
      });
    return () => {
      live = false;
    };
  }, [open]);

  // Read inside the key handler rather than closed over, so the effect below
  // depends on `open` alone. A caller passing an inline arrow re-runs any
  // effect that lists `onClose`, and this one pulls focus back to the trigger
  // when it tears down — which would take focus out of the textarea on every
  // keystroke.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Focus moves in on open and back to the trigger on close, and Tab stays
  // inside the panel while it is up.
  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    node?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;

      const stops = focusable(node);
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setError(null);

    if (!token) {
      setError(TOKEN_FAILED);
      return;
    }

    setSending(true);
    try {
      await api.post("/report", { subject, message, website, ...token });
      setSent(true);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      setError(typeof detail === "string" ? detail : SEND_FAILED);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.reportScrim} data-testid="report-dialog">
      <div
        className={styles.reportPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        tabIndex={-1}
        ref={panel}
      >
        <h2 className={styles.reportTitle} id="report-title">
          Report an error
        </h2>

        {sent ? (
          <>
            <p className={styles.reportNote} role="status">
              The mail service accepted the report for delivery.
            </p>
            <div className={styles.reportActions}>
              <button type="button" className={styles.reportSubmit} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form className={styles.reportForm} onSubmit={submit} noValidate>
            <p className={styles.reportNote}>
              A useful report names the local body and the year, says which figure is
              wrong, and says what the source document shows instead.
            </p>

            {error ? (
              <p className={styles.reportError} role="alert">
                {error}
              </p>
            ) : null}

            <label className={styles.reportLabel} htmlFor="report-subject">
              Subject
            </label>
            <input
              id="report-subject"
              className={styles.reportInput}
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(event) => setSubject(event.target.value)}
            />

            <label className={styles.reportLabel} htmlFor="report-message">
              What is wrong
            </label>
            <textarea
              id="report-message"
              className={styles.reportTextarea}
              value={message}
              rows={7}
              maxLength={MESSAGE_MAX}
              required
              onChange={(event) => setMessage(event.target.value)}
            />

            {/* The honeypot: off-screen in CSS, out of the accessibility tree,
                and out of the tab order. Only a script fills it in, and the API
                answers a filled one with a plain 200 that sends nothing. */}
            <div className={styles.honeypot} aria-hidden="true">
              <label htmlFor="report-website">Website</label>
              <input
                id="report-website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            <div className={styles.reportActions}>
              <button type="button" className={styles.reportCancel} onClick={onClose}>
                Close
              </button>
              <button type="submit" className={styles.reportSubmit} disabled={sending}>
                {sending ? "Sending" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
