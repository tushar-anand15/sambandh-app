import { useEffect, useCallback, useRef } from "react";
import { X, FileText, MapPin, Calendar, Hash, ZoomIn, ZoomOut } from "lucide-react";
import { Document, Page } from "react-pdf";
import { useState } from "react";
import "@/components/viewer/pdfWorker";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

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
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (isOpen) {
      setPdfLoading(true);
      setPdfError(null);
    }
  }, [isOpen, documentId]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth - 32;
        setContainerWidth(width);
      }
    };

    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [isOpen]);

  useEffect(() => {
    if (!pdfLoading && initialPage && initialPage > 1) {
      setTimeout(() => {
        const pageEl = pageRefs.current.get(initialPage);
        pageEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [pdfLoading, initialPage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const pdfFile = documentId
    ? {
        url: `/api/documents/${documentId}/pdf`,
        httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      }
    : null;

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setPdfLoading(false);
      setPdfError(null);
    },
    []
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    setPdfError(error.message || "Failed to load PDF");
    setPdfLoading(false);
  }, []);

  const setPageRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) pageRefs.current.set(pageNum, el);
      else pageRefs.current.delete(pageNum);
    },
    []
  );

  return (
    <>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
            onClick={onClose}/>

          {/* Drawer */}
          <div
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[85vw] md:w-[70vw] lg:w-[55vw] xl:w-[45vw]">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
              >
                <X size={20} />
              </button>

              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base text-ink sm:text-lg">
                  {documentTitle || "Document"}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {projectNo && (
                    <span className="inline-flex items-center gap-1 rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                      <Hash size={10} />
                      {projectNo}
                    </span>
                  )}
                  {district && (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-subtle px-1.5 py-0.5 text-[10px] font-medium text-indigo">
                      <MapPin size={10} />
                      {district}
                    </span>
                  )}
                  {lbName && (
                    <span className="text-[10px] text-ink-faint">{lbName}</span>
                  )}
                  {year && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint">
                      <Calendar size={10} />
                      {year}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* PDF Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-canvas/50 px-4 py-2">
              <span className="font-mono text-xs text-ink-muted">
                {numPages ? `${numPages} pages` : "Loading..."}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
                  disabled={scale <= 0.5}
                  className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface disabled:opacity-30"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="w-12 text-center font-mono text-xs text-ink-faint">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
                  disabled={scale >= 1.5}
                  className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface disabled:opacity-30"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            {/* PDF Content - Continuous Scroll */}
            <div ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-canvas/30">
              {pdfError ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <FileText
                    size={48}
                    className="mb-3 text-ink-faint"
                    strokeWidth={1}
                  />
                  <p className="text-sm font-medium text-ink-muted">
                    No document available
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-ink-faint">
                    {pdfError}
                  </p>
                </div>
              ) : pdfFile ? (
                <Document
                  file={pdfFile}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <div className="flex h-[600px] items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
                        <span className="text-xs text-ink-faint">
                          Loading PDF...
                        </span>
                      </div>
                    </div>
                  }
                  className="flex flex-col items-center gap-4 py-4"
                >
                  {!pdfLoading &&
                    containerWidth > 0 &&
                    numPages &&
                    Array.from({ length: numPages }, (_, i) => i + 1).map(
                      (pageNum) => (
                        <div
                          key={pageNum}
                          ref={setPageRef(pageNum)}
                          className="relative"
                        >
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-ink/60 px-2 py-0.5 text-[10px] font-medium text-white">
                            {pageNum}
                          </div>
                          <Page
                            pageNumber={pageNum}
                            width={containerWidth * scale - 32}
                            className="shadow-lg"
                            loading={
                              <div
                                className="flex animate-pulse items-center justify-center rounded bg-border/20"
                                style={{
                                  width: containerWidth * scale - 32,
                                  height: (containerWidth * scale - 32) * 1.414,
                                }}
                              >
                                <span className="text-xs text-ink-faint">
                                  Loading page {pageNum}...
                                </span>
                              </div>
                            }
                          />
                        </div>
                      )
                    )}
                </Document>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-ink-faint">No document selected</p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="border-t border-border bg-surface-alt/50 px-4 py-2 text-center">
              <p className="text-[10px] text-ink-faint">
                Press <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[9px]">Esc</kbd> to close
                {" · "}
                Scroll to navigate
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
