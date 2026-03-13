import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileWarning } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPaneProps {
  documentId: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalPages?: number | null;
}

export default function PdfPane({
  documentId,
  currentPage,
  onPageChange,
  totalPages: totalPagesFromProps,
}: PdfPaneProps) {
  const [numPages, setNumPages] = useState<number | null>(
    totalPagesFromProps ?? null,
  );
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);

  const pageCount = numPages ?? totalPagesFromProps ?? 0;

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const pdfFile = {
    url: `/api/documents/${documentId}/pdf`,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  };

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setPdfLoading(false);
      setPdfError(null);
    },
    [],
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    setPdfError(error.message || "Failed to load PDF");
    setPdfLoading(false);
  }, []);

  return (
    <div className="flex h-full flex-col bg-canvas/50">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[60px] text-center font-mono text-[10px] text-ink-muted">
            {currentPage} / {pageCount || "—"}
          </span>
          <button
            onClick={() =>
              onPageChange(Math.min(pageCount || currentPage, currentPage + 1))
            }
            disabled={currentPage >= (pageCount || 1)}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-alt"
          >
            <ZoomOut size={13} />
          </button>
          <span className="font-mono text-[10px] text-ink-faint w-8 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
            className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-alt"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        {pdfError ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <FileWarning size={32} className="text-ink-faint" strokeWidth={1.2} />
            <div>
              <p className="text-xs font-medium text-ink-muted">
                PDF not available
              </p>
              <p className="mt-1 text-[10px] text-ink-faint max-w-[200px]">
                {pdfError}
              </p>
            </div>
          </div>
        ) : (
          <Document
            file={pdfFile}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-xs text-ink-faint">
                  Loading PDF...
                </div>
              </div>
            }
          >
            {!pdfLoading && (
              <Page
                pageNumber={currentPage}
                scale={scale}
                loading={
                  <div className="animate-pulse rounded bg-border/20 w-[595px] h-[842px]" />
                }
              />
            )}
          </Document>
        )}
      </div>
    </div>
  );
}
