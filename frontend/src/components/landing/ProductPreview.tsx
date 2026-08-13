import { useState } from "react";
import { Search, MessageSquareText, FileText, MapPin, Calendar, Building2, ChevronRight, FileType } from "lucide-react";

const mockDocuments = [
  {
    id: 1,
    title: "Construction of road at Ammarthodu Chira",
    projectNo: "308",
    lbName: "Chalakkudy Municipality",
    district: "Thrissur",
    year: "2023-24",
    amount: "₹12.5L",
  },
  {
    id: 2,
    title: "Drinking water supply scheme extension",
    projectNo: "156",
    lbName: "Kodungallur Municipality",
    district: "Thrissur",
    year: "2023-24",
    amount: "₹8.2L",
  },
  {
    id: 3,
    title: "Construction of community hall",
    projectNo: "412",
    lbName: "Irinjalakuda Municipality",
    district: "Thrissur",
    year: "2022-23",
    amount: "₹25.0L",
  },
  {
    id: 4,
    title: "Street lighting LED conversion",
    projectNo: "89",
    lbName: "Guruvayur Municipality",
    district: "Thrissur",
    year: "2023-24",
    amount: "₹5.8L",
  },
];

const mockChunks = [
  { id: 1, text: "Project Name: Construction of road at Ammarthodu Chira Road", highlight: true },
  { id: 2, text: "Project Number: 308", highlight: false },
  { id: 3, text: "Local Body: Chalakkudy Municipality", highlight: false },
  { id: 4, text: "District: Thrissur", highlight: false },
  { id: 5, text: "Estimated Cost: ₹12,50,000", highlight: true },
  { id: 6, text: "Administrative Sanction: AS/2023/1245 dated 15-06-2023", highlight: false },
  { id: 7, text: "Technical Sanction: TS/2023/892 dated 22-06-2023", highlight: false },
  { id: 8, text: "Work Order: WO/2023/456 dated 01-07-2023", highlight: false },
];

function ExplorerPreview() {
  const [selectedDoc, setSelectedDoc] = useState(0);
  const [activeTab, setActiveTab] = useState<"pdf" | "text">("text");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_48px_rgba(0,0,0,0.08)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-alt px-3 py-2">
        <div className="h-2 w-2 rounded-full bg-error/50" />
        <div className="h-2 w-2 rounded-full bg-warning/50" />
        <div className="h-2 w-2 rounded-full bg-success/50" />
        <div className="ml-2 flex items-center gap-1.5 text-[10px] text-ink-muted">
          <Search size={10} />
          <span>Document Explorer</span>
        </div>
      </div>

      <div className="flex h-[360px]">
        {/* Mini sidebar */}
        <div className="w-[52px] shrink-0 border-r border-border bg-surface-alt p-2">
          <div className="mb-3 text-center font-display text-[8px] font-bold text-indigo">GS</div>
          <div className="space-y-1">
            <div className="flex h-7 w-full items-center justify-center rounded-md text-ink-faint hover:bg-surface">
              <MessageSquareText size={12} />
            </div>
            <div className="flex h-7 w-full items-center justify-center rounded-md bg-indigo-subtle">
              <Search size={12} className="text-indigo" />
            </div>
          </div>
        </div>

        {/* Results list */}
        <div className="w-[200px] shrink-0 border-r border-border bg-surface p-3">
          {/* Search box */}
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
            <Search size={10} className="text-ink-faint" />
            <span className="text-[9px] text-ink-muted">road construction</span>
          </div>

          {/* Filter chips */}
          <div className="mb-3 flex flex-wrap gap-1">
            <span className="rounded-full bg-indigo-subtle px-1.5 py-0.5 text-[8px] font-medium text-indigo">
              Thrissur
            </span>
            <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[8px] text-ink-muted">
              2023-24
            </span>
          </div>

          {/* Results */}
          <div className="space-y-1.5">
            {mockDocuments.map((doc, i) => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(i)}
                className={`cursor-pointer rounded-lg border p-2 transition-all ${
                  selectedDoc === i
                    ? "border-indigo/30 bg-indigo-subtle/50 shadow-sm"
                    : "border-transparent bg-surface-alt/50 hover:border-border hover:bg-surface-alt"
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[9px] font-medium leading-tight text-ink line-clamp-2">
                    {doc.title}
                  </p>
                  <ChevronRight size={10} className="shrink-0 text-ink-faint" />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[8px] text-ink-muted">
                  <span className="font-mono">#{doc.projectNo}</span>
                  <span>•</span>
                  <span>{doc.amount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Document viewer */}
        <div className="flex flex-1 flex-col bg-surface-alt/30 p-3">
          {/* Header */}
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <FileText size={12} className="text-indigo" />
              <h3 className="text-[10px] font-semibold text-ink">
                {mockDocuments[selectedDoc].title}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-ink-muted">
              <span className="flex items-center gap-0.5">
                <Building2 size={8} />
                {mockDocuments[selectedDoc].lbName}
              </span>
              <span className="flex items-center gap-0.5">
                <MapPin size={8} />
                {mockDocuments[selectedDoc].district}
              </span>
              <span className="flex items-center gap-0.5">
                <Calendar size={8} />
                {mockDocuments[selectedDoc].year}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-2 flex gap-1">
            <button
              onClick={() => setActiveTab("pdf")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[8px] font-medium transition-colors ${
                activeTab === "pdf"
                  ? "bg-indigo/10 text-indigo border border-indigo/20"
                  : "bg-surface text-ink-muted border border-border hover:border-border-strong"
              }`}
            >
              <FileType size={9} />
              PDF
            </button>
            <button
              onClick={() => setActiveTab("text")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[8px] font-medium transition-colors ${
                activeTab === "text"
                  ? "bg-indigo/10 text-indigo border border-indigo/20"
                  : "bg-surface text-ink-muted border border-border hover:border-border-strong"
              }`}
            >
              <FileText size={9} />
              Text
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface">
            {activeTab === "text" ? (
              <div className="h-full overflow-y-auto p-2">
                <div className="space-y-1">
                  {mockChunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className={`rounded px-1.5 py-1 text-[8px] leading-relaxed ${
                        chunk.highlight
                          ? "bg-indigo/10 text-ink"
                          : "text-ink-muted"
                      }`}
                    >
                      {chunk.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center bg-surface-alt/50">
                <div className="text-center">
                  <FileText size={24} className="mx-auto mb-1 text-ink-faint" />
                  <p className="text-[8px] text-ink-muted">PDF Preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductPreview() {
  return (
    <section className="border-t border-border bg-surface-alt py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo">
            The Interface
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-ink">
            Search, inspect, verify
          </h2>
        </div>

        <div>
          <ExplorerPreview />
        </div>
      </div>
    </section>
  );
}
