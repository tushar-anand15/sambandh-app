import { motion } from "framer-motion";
import { FileWarning, Lock, Eye } from "lucide-react";

const points = [
  {
    icon: FileWarning,
    title: "Records exist, but are buried",
    text: "India's 240,000+ local bodies generate vast public data — meeting minutes, project proposals, budget allocations. But this information is scattered across poorly structured PDFs and separate government portals.",
  },
  {
    icon: Lock,
    title: "PDFs are hard to search",
    text: "Citizens, journalists, and civil society cannot easily see who proposed a project, how it was approved, or how public funds were ultimately spent. The data is technically public, but practically inaccessible.",
  },
  {
    icon: Eye,
    title: "Transparency needs infrastructure",
    text: "When civic information becomes accessible, accountability improves. GramSAMBANDH converts opaque bureaucratic records into searchable, understandable civic data.",
  },
];

export default function WhyMatters() {
  return (
    <section className="border-t border-border bg-surface py-24">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo">
            The Problem
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-ink">
            Why this matters
          </h2>
        </motion.div>

        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {points.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.12, duration: 0.6 }}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-subtle">
                <p.icon size={20} className="text-indigo" strokeWidth={1.6} />
              </div>
              <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {p.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
