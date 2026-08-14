/**
 * A document, alongside the table it came from.
 *
 * The drawer knows nothing about finances, projects or years: it takes a
 * heading, a line of context, and an address. Any section with a scanned
 * source can open one, and a section whose sources are HTML rather than PDF
 * wants a sibling of this file, not a flag inside it.
 *
 * The document itself is rendered rather than downloaded. A reader checking a
 * figure against the sanctioning order should not have to leave the table,
 * find the file in a downloads folder, and come back.
 *
 * Where there is no address, the drawer still opens and states why. That is the
 * case a link cannot express: the row has a document, Sulekha holds it, and
 * this deployment cannot hand over an address for it.
 */

import { Suspense, lazy, useEffect, useRef } from "react";

const PdfPages = lazy(() => import("./PdfPages"));

interface PdfDrawerProps {
  open: boolean;
  /** The heading inside the drawer. */
  title: string;
  /** One line of context under it: the body, the year, the project number. */
  subtitle?: string;
  /** Where the document is, or null where no address is published. */
  url: string | null;
  /** Why there is no address, when there is none. */
  unavailableReason?: string | null;
  onClose: () => void;
}

export default function PdfDrawer({
  open,
  title,
  subtitle,
  url,
  unavailableReason,
  onClose,
}: PdfDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        data-testid="drawer-backdrop"
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="pdf-drawer"
        className="relative flex h-full w-full max-w-4xl flex-col border-l border-rule-2 bg-paper"
      >
        <header className="flex items-start justify-between gap-s4 border-b border-rule px-s5 py-s4">
          <div>
            <h2 className="text-t5">{title}</h2>
            {subtitle ? <p className="text-t2 text-ink-2">{subtitle}</p> : null}
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="label border border-rule px-s3 py-s2"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {url ? (
            <Suspense
              fallback={<p className="selector-status p-s5">Loading the document…</p>}
            >
              <PdfPages url={url} />
            </Suspense>
          ) : (
            <p className="notice m-s5" role="status">
              {unavailableReason ?? "No document available."}
            </p>
          )}
        </div>

        {url ? (
          <footer className="border-t border-rule px-s5 py-s3">
            <a href={url} target="_blank" rel="noreferrer" className="text-t3">
              Open the document in a new tab
            </a>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
