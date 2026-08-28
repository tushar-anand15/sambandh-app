/**
 * The scan behind a citation, every page, top to bottom.
 *
 * Split out and loaded lazily so pdf.js — about half a megabyte with its
 * worker — enters the bundle only for a reader who opens a citation.
 *
 * It cannot use `components/viewer/PdfPages`, which takes a bare URL. The
 * assistant's documents come through `/api/documents/{id}/pdf`, which is behind
 * the login and wants an Authorization header, so the file is handed to
 * react-pdf as a request descriptor rather than an address. The public Finances
 * viewer is handed a signed Cloud Storage URL instead; see
 * `backend/app/routers/documents.py:200` for why the two paths differ.
 */

import { useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

import "@/components/viewer/pdfWorker";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import styles from "./chat.module.css";

interface SourcePagesProps {
  documentId: string;
  /** The page the citation pointed at, scrolled to once the file is open. */
  initialPage?: number;
}

export default function SourcePages({ documentId, initialPage = 1 }: SourcePagesProps) {
  const [pages, setPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const pageNodes = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const measure = () => {
      if (container.current) setWidth(container.current.clientWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setPages(null);
    setError(null);
  }, [documentId]);

  useEffect(() => {
    if (!pages || initialPage <= 1) return;
    pageNodes.current.get(initialPage)?.scrollIntoView({ block: "start" });
  }, [pages, initialPage]);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const file = {
    url: `/api/documents/${documentId}/pdf`,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  };

  if (error) {
    return (
      <p className="notice" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div ref={container} data-testid="source-pages">
      <Document
        file={file}
        onLoadSuccess={({ numPages }: { numPages: number }) => setPages(numPages)}
        onLoadError={(cause: Error) =>
          setError(
            `The document did not load: ${cause.message}. Reload the page to try again.`,
          )
        }
        loading={<p className="selector-status">Loading the document…</p>}
        className={styles.pages}
      >
        {width > 0 && pages
          ? Array.from({ length: pages }, (_, index) => index + 1).map((page) => (
              <div
                key={page}
                data-page={page}
                ref={(node) => {
                  if (node) pageNodes.current.set(page, node);
                  else pageNodes.current.delete(page);
                }}
              >
                <p className={styles.pageLabel}>Page {page}</p>
                <Page
                  pageNumber={page}
                  width={width}
                  loading={<p className="selector-status">Loading page {page}…</p>}
                />
              </div>
            ))
          : null}
      </Document>
    </div>
  );
}
