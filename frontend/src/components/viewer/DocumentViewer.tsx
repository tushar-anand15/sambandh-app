import { useState, useCallback, useRef, useEffect } from "react";
import type { Chunk } from "@/types";
import { Document, Page, pdfjs } from "react-pdf";
import {
  X,
  FileText,
  Hash,
  MapPin,
  Calendar,
  Building2,
  FileType,
  AlignLeft,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  documentId: string;
  title?: string;
  projectNo?: string;
  district?: string;
  lbName?: string;
  year?: string;
  pageCount?: number;
  chunks: Chunk[];
  highlightChunkId?: string;
  onClose?: () => void;
}

type ActiveTab = "pdf" | "text";

const typeColors: Record<string, string> = {
  narrative: "bg-indigo/10 text-indigo",
  kv: "bg-success/10 text-success",
  table_schema: "bg-warning/10 text-warning",
  table_rows: "bg-warning/10 text-warning",
  table_summary: "bg-warning/10 text-warning",
};

export default function DocumentViewer({
  documentId,
  title,
  projectNo,
  district,
  lbName,
  year,
  pageCount,
  chunks,
  highlightChunkId,
  onClose,
}: DocumentViewerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("text");
  const [numPages, setNumPages] = useState<number | null>(pageCount ?? null);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const pdfFile = {
    url: `/api/documents/${documentId}/pdf`,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
  };

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 32);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [activeTab]);

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

  const setChunkRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) chunkRefs.current.set(id, el);
      else chunkRefs.current.delete(id);
    },
    []
  );

  const scrollToPage = useCallback((page: number) => {
    setActiveTab("pdf");
    setTimeout(() => {
      const pageEl = pageRefs.current.get(page);
      pageEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

  const handleChunkClick = useCallback(
    (chunk: Chunk) => {
      scrollToPage(chunk.page_start);
    },
    [scrollToPage]
  );

  const totalPages = numPages ?? pageCount ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-alt/30">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText size={16} className="shrink-0 text-indigo" />
              <h3 className="truncate text-sm font-semibold text-ink">
                {title || "Document"}
              </h3>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-muted">
              {projectNo && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Hash size={10} className="text-ink-faint" />
                  {projectNo}
                </span>
              )}
              {lbName && (
                <span className="inline-flex items-center gap-1">
                  <Building2 size={10} className="text-ink-faint" />
                  {lbName}
                </span>
              )}
              {district && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} className="text-ink-faint" />
                  {district}
                </span>
              )}
              {year && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={10} className="text-ink-faint" />
                  {year}
                </span>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("pdf")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "pdf"
                ? "bg-indigo/10 text-indigo border border-indigo/20"
                : "text-ink-muted border border-transparent hover:bg-surface-alt hover:text-ink"
            }`}
          >
            <FileType size={12} />
            PDF
            {totalPages > 0 && (
              <span className="ml-1 font-mono text-[10px] opacity-60">
                {totalPages}p
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("text")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "text"
                ? "bg-indigo/10 text-indigo border border-indigo/20"
                : "text-ink-muted border border-transparent hover:bg-surface-alt hover:text-ink"
            }`}
          >
            <AlignLeft size={12} />
            Text
            <span className="ml-1 font-mono text-[10px] opacity-60">
              {chunks.length}
            </span>
          </button>
        </div>

        {activeTab === "pdf" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
              disabled={scale <= 0.5}
              className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
            >
              <ZoomOut size={14} />
            </button>
            <span className="w-10 text-center font-mono text-[10px] text-ink-faint">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
              disabled={scale >= 1.5}
              className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-alt disabled:opacity-30"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === "text" ? (
          <div className="h-full overflow-auto">
            {chunks.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <AlignLeft size={32} className="mb-2 text-ink-faint" strokeWidth={1} />
                <p className="text-xs text-ink-muted">No extracted text available</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {chunks.map((chunk) => {
                  const isHighlighted = highlightChunkId === chunk.id;
                  return (
                    <div
                      key={chunk.id}
                      ref={setChunkRef(chunk.id)}
                      onClick={() => handleChunkClick(chunk)}
                      className={`cursor-pointer px-4 py-3 transition-colors ${
                        isHighlighted
                          ? "bg-indigo/10 border-l-2 border-l-indigo"
                          : "hover:bg-surface border-l-2 border-l-transparent"
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                            typeColors[chunk.chunk_type] ||
                            "bg-border/20 text-ink-muted"
                          }`}
                        >
                          {chunk.chunk_type}
                        </span>
                        <span className="font-mono text-[9px] text-ink-faint">
                          p.{chunk.page_start}
                          {chunk.page_end !== chunk.page_start &&
                            `–${chunk.page_end}`}
                        </span>
                        {chunk.section_path.length > 0 && (
                          <span className="truncate text-[10px] text-ink-faint">
                            {chunk.section_path.join(" › ")}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink">
                        {chunk.display_text}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full overflow-auto bg-canvas/30"
          >
            {pdfError ? (
              <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                <FileText size={40} className="mb-3 text-ink-faint" strokeWidth={1} />
                <p className="text-sm font-medium text-ink-muted">
                  PDF not available
                </p>
                <p className="mt-1 max-w-xs text-xs text-ink-faint">{pdfError}</p>
              </div>
            ) : (
              <Document
                file={pdfFile}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex h-[400px] items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
                      <span className="text-xs text-ink-faint">Loading PDF...</span>
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
                      <div key={pageNum} ref={setPageRef(pageNum)} className="relative">
                        <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded bg-ink/60 px-2 py-0.5 text-[10px] font-medium text-white">
                          {pageNum}
                        </div>
                        <Page
                          pageNumber={pageNum}
                          width={Math.min(containerWidth * scale, containerWidth)}
                          className="shadow-lg"
                          loading={
                            <div
                              className="flex animate-pulse items-center justify-center rounded bg-border/20"
                              style={{
                                width: Math.min(containerWidth * scale, containerWidth),
                                height: Math.min(containerWidth * scale, containerWidth) * 1.414,
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
