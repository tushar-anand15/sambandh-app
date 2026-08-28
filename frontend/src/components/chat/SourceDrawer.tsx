/**
 * The document behind a citation, beside the answer that cited it.
 *
 * It opens over the transcript rather than navigating away, for the same reason
 * the finances table opens its sanctioning orders in a panel: a reader checking
 * a claim against the scan is in the middle of reading the claim.
 *
 * The head repeats the project number, the local body, the district and the
 * year, so the panel names what is open without the reader having to recognise
 * the first page of a scan.
 */

import { Suspense, lazy, useEffect, useRef } from "react";

import styles from "./chat.module.css";

const SourcePages = lazy(() => import("./SourcePages"));

interface SourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
  documentTitle?: string;
  lbName?: string;
  district?: string;
  year?: string;
  projectNo?: string;
  initialPage?: number;
}

export default function SourceDrawer({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  lbName,
  district,
  year,
  projectNo,
  initialPage = 1,
}: SourceDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const title = documentTitle || "Document";
  const meta = [projectNo ? `Project ${projectNo}` : null, lbName, district, year]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={styles.scrim}>
      <button
        type="button"
        className={styles.veil}
        onClick={onClose}
        data-testid="source-backdrop"
        aria-label="Close the document"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="source-drawer"
        className={styles.panel}
      >
        <header className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{title}</h2>
            {meta ? <p className={styles.panelMeta}>{meta}</p> : null}
          </div>
          <button
            ref={closeButton}
            type="button"
            className={styles.action}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className={styles.panelBody}>
          {documentId ? (
            <Suspense fallback={<p className="selector-status">Loading the document…</p>}>
              <SourcePages documentId={documentId} initialPage={initialPage} />
            </Suspense>
          ) : (
            <p className="notice" role="status">
              No document available.
            </p>
          )}
        </div>

        <footer className={styles.panelFoot}>Esc closes the document.</footer>
      </aside>
    </div>
  );
}
