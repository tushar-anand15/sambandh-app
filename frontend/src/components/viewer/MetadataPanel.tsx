import type { Chunk } from "@/types";

interface MetadataPanelProps {
  metadata: Record<string, string>;
  chunks: Chunk[];
}

export default function MetadataPanel({ metadata, chunks }: MetadataPanelProps) {
  const chunkStats = {
    total: chunks.length,
    kv: chunks.filter((c) => c.chunk_type === "kv").length,
    narrative: chunks.filter((c) => c.chunk_type === "narrative").length,
    table_schema: chunks.filter((c) => c.chunk_type === "table_schema").length,
    table_rows: chunks.filter((c) => c.chunk_type === "table_rows").length,
    table_summary: chunks.filter((c) => c.chunk_type === "table_summary").length,
  };

  const pageRange = chunks.length
    ? `${Math.min(...chunks.map((c) => c.page_start))}–${Math.max(...chunks.map((c) => c.page_end))}`
    : "–";

  return (
    <div className="p-5 space-y-6">
      {/* Document metadata */}
      {Object.keys(metadata).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-3">
            Document Metadata
          </h4>
          <dl className="space-y-2">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex gap-3">
                <dt className="w-32 shrink-0 font-mono text-[11px] text-ink-muted">
                  {key}
                </dt>
                <dd className="text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Chunk statistics */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-3">
          Chunk Statistics
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-lg font-semibold text-ink">{chunkStats.total}</p>
            <p className="text-[11px] text-ink-muted">Total chunks</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-lg font-semibold text-ink">{pageRange}</p>
            <p className="text-[11px] text-ink-muted">Page range</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {Object.entries(chunkStats)
            .filter(([k, v]) => k !== "total" && v > 0)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-ink-muted">{type}</span>
                <span className="text-sm font-medium text-ink">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
