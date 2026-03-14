import { useRef, useEffect, useCallback } from "react";
import type { Chunk } from "@/types";

interface ChunkedTextPaneProps {
  chunks: Chunk[];
  currentPdfPage: number;
  highlightChunkId?: string;
  onChunkClick: (chunk: Chunk) => void;
}

const typeColors: Record<string, string> = {
  narrative: "bg-indigo-subtle text-indigo",
  kv: "bg-success/10 text-success",
  table_schema: "bg-warning/10 text-warning",
  table_rows: "bg-warning/10 text-warning",
  table_summary: "bg-warning/10 text-warning",
};

function isChunkOnPage(chunk: Chunk, page: number): boolean {
  return page >= chunk.page_start && page <= chunk.page_end;
}

export default function ChunkedTextPane({
  chunks,
  currentPdfPage,
  highlightChunkId,
  onChunkClick,
}: ChunkedTextPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setChunkRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) chunkRefs.current.set(id, el);
      else chunkRefs.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const firstMatch = chunks.find((c) => isChunkOnPage(c, currentPdfPage));
    if (firstMatch) {
      const el = chunkRefs.current.get(firstMatch.id);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentPdfPage, chunks]);

  if (chunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-xs text-ink-faint">No extracted text available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Pane header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          Extracted Text
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          {chunks.length} chunk{chunks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Chunks */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div className="divide-y divide-border/50">
          {chunks.map((chunk) => {
            const onPage = isChunkOnPage(chunk, currentPdfPage);
            const isHighlighted = highlightChunkId === chunk.id;
            return (
              <div
                key={chunk.id}
                ref={setChunkRef(chunk.id)}
                onClick={() => onChunkClick(chunk)}
                className={`cursor-pointer px-4 py-3 transition-colors ${
                  isHighlighted
                    ? "bg-warning/20 border-l-2 border-l-warning"
                    : onPage
                      ? "bg-indigo-subtle/30 border-l-2 border-l-indigo"
                      : "hover:bg-surface-alt/40 border-l-2 border-l-transparent"
                }`}
              >
                {/* Chunk header */}
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      typeColors[chunk.chunk_type] || "bg-border/20 text-ink-muted"
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
                      {chunk.section_path.join(" > ")}
                    </span>
                  )}
                </div>

                {/* Chunk text */}
                <p className="text-[12.5px] leading-[1.7] text-ink whitespace-pre-wrap">
                  {chunk.display_text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
