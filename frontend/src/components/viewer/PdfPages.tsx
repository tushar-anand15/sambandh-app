/**
 * A PDF, every page, top to bottom.
 *
 * Split out of `PdfDrawer` and loaded lazily so that pdf.js and its worker
 * enter the bundle only for a reader who has actually opened a document. The
 * library is about half a megabyte; a page that lists projects should not carry
 * it for the ninety-nine readers out of a hundred who never open one.
 *
 * The worker is the copy in `node_modules`, resolved by Vite through `?url`.
 * react-pdf's own default points at unpkg.com, which would make this the only
 * request the site sends off-origin.
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

import "./pdfWorker";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PdfPagesProps {
  /** The address of the document. Signed URLs expire, so this may go stale. */
  url: string;
}

export default function PdfPages({ url }: PdfPagesProps) {
  const [pages, setPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      if (container.current) setWidth(container.current.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    // A new document starts from nothing, or the old page count would sit
    // under the new file until it finished loading.
    setPages(null);
    setError(null);
  }, [url]);

  return (
    <div ref={container} className="h-full overflow-auto p-s4" data-testid="pdf-pages">
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : (
        <Document
          file={url}
          onLoadSuccess={({ numPages }: { numPages: number }) => setPages(numPages)}
          onLoadError={(cause: Error) =>
            setError(
              `The document did not load: ${cause.message}. The link expires an hour after the page was opened; reload to get a fresh one.`,
            )
          }
          loading={<p className="selector-status">Loading the document…</p>}
          className="flex flex-col items-center gap-s4"
        >
          {width > 0 && pages
            ? Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
                <div key={page} data-page={page}>
                  <p className="label">Page {page}</p>
                  <Page
                    pageNumber={page}
                    width={width}
                    loading={<p className="selector-status">Loading page {page}…</p>}
                  />
                </div>
              ))
            : null}
        </Document>
      )}
    </div>
  );
}
