import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import type { Chunk, DocResult } from "@/types";
import SearchBar from "@/components/explorer/SearchBar";
import FilterRow from "@/components/explorer/FilterRow";
import ResultsList from "@/components/explorer/ResultsList";
import DocumentViewer from "@/components/viewer/DocumentViewer";

interface ViewerData {
  id: string;
  title: string;
  chunks: Chunk[];
  district?: string;
  projectNo?: string;
  lbName?: string;
  year?: string;
  pageCount?: number;
}

export default function ExplorerPage() {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [lbType, setLbType] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<DocResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedId, setSelectedId] = useState<string>();
  const [viewerDoc, setViewerDoc] = useState<ViewerData | null>(null);

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  const search = useCallback(
    async (p: number = 1) => {
      setLoading(true);
      setInitialLoad(false);
      try {
        const { data } = await api.get("/documents", {
          params: {
            q: query || undefined,
            district: district || undefined,
            lb_type: lbType || undefined,
            year: year || undefined,
            page: p,
            page_size: pageSize,
          },
        });
        setResults(data.documents);
        setTotal(data.total);
        setPage(p);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [query, district, lbType, year],
  );

  useEffect(() => {
    const hasFilter = district || lbType || year;
    if (hasFilter) {
      search(1);
    }
  }, [district, lbType, year]);

  const handleSelect = useCallback(async (doc: DocResult) => {
    setSelectedId(doc.id);
    try {
      const { data } = await api.get(`/documents/${doc.id}`);
      setViewerDoc({
        id: doc.id,
        title: data.title || doc.title || "Untitled",
        chunks: data.chunks || [],
        district: data.district,
        projectNo: data.project_no,
        lbName: data.lb_name,
        year: data.year,
        pageCount: data.page_count,
      });
    } catch {
      setViewerDoc(null);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="border-b border-border px-6 py-3">
        <h2 className="font-display text-lg text-ink">Data Explorer</h2>
        <p className="text-[10px] text-ink-faint tracking-wide uppercase">
          Sulekha project records
        </p>
      </div>

      {/* Search & filters */}
      <div className="border-b border-border px-5 py-3 space-y-2.5">
        <div className="flex gap-2">
          <div className="flex-1">
            <SearchBar value={query} onChange={setQuery} onSearch={() => search(1)} />
          </div>
          <button
            onClick={() => search(1)}
            className="rounded-md bg-indigo px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-hover"
          >
            Search
          </button>
        </div>
        <FilterRow
          district={district}
          lbType={lbType}
          year={year}
          onDistrictChange={setDistrict}
          onLbTypeChange={setLbType}
          onYearChange={setYear}
        />
        {!initialLoad && (
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-ink-faint font-mono">
              {total.toLocaleString()} result{total !== 1 ? "s" : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => search(page - 1)}
                  disabled={page <= 1}
                  className="rounded border border-border p-0.5 text-ink-muted transition-colors hover:bg-surface disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono text-[10px] text-ink-muted">
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => search(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded border border-border p-0.5 text-ink-muted transition-colors hover:bg-surface disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Results list */}
        <div className="w-[260px] shrink-0 overflow-auto border-r border-border">
          {initialLoad ? (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-subtle">
                <Database size={20} className="text-indigo" strokeWidth={1.4} />
              </div>
              <p className="text-xs font-medium text-ink">Search to explore</p>
              <p className="mt-1 text-[10px] text-ink-faint max-w-[200px]">
                Enter a query or apply filters to browse project records
              </p>
            </div>
          ) : (
            <ResultsList
              results={results}
              selectedId={selectedId}
              onSelect={handleSelect}
              loading={loading}
            />
          )}
        </div>

        {/* Document viewer */}
        <div className="flex-1 overflow-hidden">
          {viewerDoc ? (
            <DocumentViewer
              documentId={viewerDoc.id}
              title={viewerDoc.title}
              projectNo={viewerDoc.projectNo}
              district={viewerDoc.district}
              lbName={viewerDoc.lbName}
              year={viewerDoc.year}
              pageCount={viewerDoc.pageCount}
              chunks={viewerDoc.chunks}
              onClose={() => {
                setViewerDoc(null);
                setSelectedId(undefined);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-ink-faint">
                Select a document to inspect
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
