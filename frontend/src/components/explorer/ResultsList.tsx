import type { DocResult } from "@/types";
import { FileText } from "lucide-react";

interface ResultsListProps {
  results: DocResult[];
  selectedId?: string;
  onSelect: (doc: DocResult) => void;
  loading?: boolean;
}

export default function ResultsList({
  results,
  selectedId,
  onSelect,
  loading,
}: ResultsListProps) {
  if (loading) {
    return (
      <div className="p-2 space-y-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded px-3 py-2.5">
            <div className="h-3 w-4/5 rounded bg-border/50" />
            <div className="mt-1.5 h-2 w-2/3 rounded bg-border/30" />
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xs text-ink-muted">No documents found</p>
        <p className="mt-1 text-[10px] text-ink-faint">
          Adjust your search or filters
        </p>
      </div>
    );
  }

  return (
    <div className="p-1.5 space-y-px">
      {results.map((doc) => {
        const isSelected = selectedId === doc.id;
        return (
          <button
            key={doc.id}
            onClick={() => onSelect(doc)}
            className={`group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
              isSelected
                ? "bg-indigo-subtle/60 text-ink"
                : "text-ink hover:bg-surface-alt/60"
            }`}
          >
            <FileText
              size={14}
              className={`mt-0.5 shrink-0 ${isSelected ? "text-indigo" : "text-ink-faint"}`}
              strokeWidth={1.6}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                {doc.project_no && (
                  <span className={`shrink-0 font-mono text-[10px] font-medium ${isSelected ? "text-indigo" : "text-ink-muted"}`}>
                    {doc.project_no}
                  </span>
                )}
                <span className="truncate text-[11px] text-ink-faint">
                  {doc.lb_name || doc.district || ""}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-medium">
                {doc.title || "Untitled"}
              </p>
            </div>
            {doc.year && (
              <span className="mt-0.5 shrink-0 font-mono text-[9px] text-ink-faint">
                {doc.year}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
