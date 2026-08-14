/**
 * A side panel holding one document the API has already sanitised.
 *
 * The Meetings list opens this with a meeting's decision register or minutes.
 * The markup arrives from `/api/meetings/register/{meeting_id}/{kind}`, which
 * runs `backend/app/artifacts.py` over Sakarma's published file: scripts,
 * styles, ids, hrefs and inline handlers are gone before the string leaves the
 * API, and the only attributes left are colspan and rowspan. That is what makes
 * `dangerouslySetInnerHTML` the right call here rather than a reckless one —
 * the alternative, sanitising in the browser, would ship a second copy of the
 * rules and let the two disagree.
 *
 * Scrollable, not paginated. A decision register runs from one decision to
 * fifty and has no page boundaries of its own; inventing some would put a
 * control between a reader and the next sentence.
 *
 * The panel is a dialog: focus moves into it on open, Escape closes it, and
 * the page behind it keeps its scroll position, so closing returns the reader
 * to the row they opened.
 */

import { useEffect, useRef } from "react";

import styles from "./htmlDrawer.module.css";

interface HtmlDrawerProps {
  open: boolean;
  /** Names the document: "Decision register", and the meeting under it. */
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * The sanitised fragment. Undefined while loading, or when the panel is
   * showing a state rather than a document.
   */
  html?: string;
}

export default function HtmlDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  html,
}: HtmlDrawerProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.scrim} data-testid="html-drawer">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.body}>
          {children}
          {html ? (
            <div
              className={styles.document}
              data-testid="register-html"
              // Sanitised in `backend/app/artifacts.py`. See the note above.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
