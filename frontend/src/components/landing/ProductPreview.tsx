import { motion } from "framer-motion";

function ExplorerMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_48px_rgba(0,0,0,0.08)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface-alt">
        <div className="h-2.5 w-2.5 rounded-full bg-error/50" />
        <div className="h-2.5 w-2.5 rounded-full bg-warning/50" />
        <div className="h-2.5 w-2.5 rounded-full bg-success/50" />
        <div className="mx-auto h-4 w-64 rounded-md bg-border/50" />
      </div>

      <div className="flex h-[400px]">
        {/* Sidebar */}
        <div className="w-[160px] shrink-0 border-r border-border bg-surface-alt p-4">
          <div className="mb-6">
            <div className="h-4 w-24 rounded-sm bg-indigo/20" />
            <div className="mt-1 h-2 w-16 rounded-sm bg-border/50" />
          </div>
          <div className="space-y-1.5">
            <div className="h-8 rounded-md bg-surface" />
            <div className="h-8 rounded-md bg-indigo-subtle" />
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1">
          {/* Results list */}
          <div className="w-[240px] shrink-0 border-r border-border p-4">
            <div className="mb-4 h-8 rounded-md border border-border bg-surface" />
            <div className="flex gap-2 mb-4">
              <div className="h-6 flex-1 rounded-md bg-border/40" />
              <div className="h-6 flex-1 rounded-md bg-border/40" />
              <div className="h-6 flex-1 rounded-md bg-border/40" />
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`rounded-lg border p-3 ${
                    n === 2
                      ? "border-indigo/30 bg-indigo-subtle/50"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="h-3 w-3/4 rounded-sm bg-border/70" />
                  <div className="mt-1.5 h-2 w-1/2 rounded-sm bg-border/40" />
                  <div className="mt-1.5 h-2 w-full rounded-sm bg-border/30" />
                </div>
              ))}
            </div>
          </div>

          {/* Document viewer */}
          <div className="flex flex-1 flex-col p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-4 w-40 rounded-sm bg-border/60" />
              <div className="h-4 w-16 rounded-full bg-indigo-subtle" />
            </div>
            <div className="flex gap-2 mb-3">
              <div className="h-7 w-20 rounded-md bg-indigo/10 border border-indigo/20" />
              <div className="h-7 w-20 rounded-md bg-surface border border-border" />
              <div className="h-7 w-20 rounded-md bg-surface border border-border" />
            </div>
            <div className="flex-1 rounded-lg border border-border bg-surface p-4">
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2.5 rounded-sm ${
                      i === 3 || i === 4
                        ? "bg-indigo/10"
                        : "bg-border/40"
                    }`}
                    style={{ width: `${55 + Math.random() * 45}%` }}
                  />
                ))}
              </div>
            </div>
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo">
            The Interface
          </p>
          <h2 className="mt-3 font-display text-3xl tracking-tight text-ink">
            Search, inspect, verify
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
        >
          <ExplorerMockup />
        </motion.div>
      </div>
    </section>
  );
}
