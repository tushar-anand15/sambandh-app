import { useState, useCallback, useRef, useEffect } from "react";
import type { Chunk } from "@/types";
import PdfPane from "./PdfPane";
import ChunkedTextPane from "./ChunkedTextPane";
import { X, FileText, Hash, MapPin, Calendar } from "lucide-react";

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
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.25, Math.min(0.75, ratio)));
    };
    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleChunkClick = useCallback((chunk: Chunk) => {
    setCurrentPdfPage(chunk.page_start);
  }, []);

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Compact header bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="min-w-0 flex-1 flex items-center gap-3">
          <h3 className="truncate text-sm font-semibold text-ink">
            {title || "Document"}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {projectNo && (
              <span className="inline-flex items-center gap-1 rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                <Hash size={9} />
                {projectNo}
              </span>
            )}
            {district && (
              <span className="inline-flex items-center gap-1 rounded bg-indigo-subtle px-1.5 py-0.5 text-[10px] font-medium text-indigo">
                <MapPin size={9} />
                {district}
              </span>
            )}
            {lbName && (
              <span className="text-[10px] text-ink-faint">{lbName}</span>
            )}
            {year && (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint">
                <Calendar size={9} />
                {year}
              </span>
            )}
            {pageCount && (
              <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint">
                <FileText size={9} />
                {pageCount}p
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Split view: PDF | Text */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* PDF pane */}
        <div
          className="shrink-0 overflow-hidden border-r border-border"
          style={{ width: `${splitRatio * 100}%` }}
        >
          <PdfPane
            documentId={documentId}
            currentPage={currentPdfPage}
            onPageChange={setCurrentPdfPage}
            totalPages={pageCount}
          />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-indigo/30 transition-colors"
        />

        {/* Text + chunks pane */}
        <div className="flex-1 overflow-hidden">
          <ChunkedTextPane
            chunks={chunks}
            currentPdfPage={currentPdfPage}
            highlightChunkId={highlightChunkId}
            onChunkClick={handleChunkClick}
          />
        </div>
      </div>
    </div>
  );
}
