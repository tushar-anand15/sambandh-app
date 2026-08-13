import { MessageSquareText, Search, FileText } from "lucide-react";

const features = [
  {
    icon: MessageSquareText,
    title: "Chat over records",
    description:
      "Ask natural-language questions about Sulekha project data. Answers are grounded in retrieved content with source citations.",
  },
  {
    icon: Search,
    title: "Search and filter documents",
    description:
      "Browse records by district, local body, year, and keyword. Full-text search across millions of extracted chunks.",
  },
  {
    icon: FileText,
    title: "Inspect PDF and text side by side",
    description:
      "View the original PDF alongside extracted text and structured chunks. Verify AI-generated answers against the source.",
  },
];

export default function DemoFeatures() {
  return (
    <section id="features" className="border-t border-border py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo">
            What the demo includes
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-ink">
            Three ways to explore
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-muted">
            A focused demo — not a full platform. Each mode lets you inspect
            Kerala's Sulekha project records from a different angle.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-surface p-6 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-subtle transition-colors group-hover:bg-indigo/10">
                <f.icon
                  size={22}
                  className="text-indigo"
                  strokeWidth={1.6}
                />
              </div>
              <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
