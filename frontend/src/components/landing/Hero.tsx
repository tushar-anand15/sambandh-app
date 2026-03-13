import { motion } from "framer-motion";
import { ArrowRight, Layers } from "lucide-react";
import { Link } from "react-router-dom";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.7,
      ease: [0.25, 0.4, 0.25, 1] as [number, number, number, number],
    },
  }),
};

function DashboardMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="h-2.5 w-2.5 rounded-full bg-error/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <div className="ml-3 h-3 w-48 rounded-sm bg-border" />
        </div>
        {/* App frame */}
        <div className="flex h-[320px]">
          {/* Sidebar mock */}
          <div className="w-[140px] border-r border-border bg-surface-alt p-3">
            <div className="mb-4 h-4 w-20 rounded-sm bg-indigo/20" />
            <div className="space-y-2">
              <div className="h-7 rounded-md bg-indigo-subtle" />
              <div className="h-7 rounded-md bg-transparent" />
            </div>
            <div className="mt-auto pt-36">
              <div className="h-7 rounded-md bg-border/50" />
            </div>
          </div>
          {/* Content mock */}
          <div className="flex flex-1 gap-3 p-4">
            {/* Left panel */}
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-28 rounded-sm bg-border" />
              <div className="flex-1 rounded-lg border border-border p-3">
                <div className="space-y-2">
                  <div className="h-3 w-full rounded-sm bg-border/70" />
                  <div className="h-3 w-4/5 rounded-sm bg-border/50" />
                  <div className="h-3 w-3/4 rounded-sm bg-border/40" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-8 rounded-md bg-indigo-subtle/60" />
                  <div className="h-3 w-5/6 rounded-sm bg-border/50" />
                  <div className="h-3 w-2/3 rounded-sm bg-border/40" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-9 flex-1 rounded-md border border-border bg-surface" />
                <div className="h-9 w-9 rounded-md bg-indigo/20" />
              </div>
            </div>
            {/* Right panel */}
            <div className="flex w-[200px] flex-col gap-2">
              <div className="flex gap-2">
                <div className="h-6 flex-1 rounded-md bg-border/60" />
                <div className="h-6 flex-1 rounded-md bg-surface" />
              </div>
              <div className="flex-1 rounded-lg border border-border bg-surface p-3">
                <div className="space-y-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-2 rounded-sm bg-border/40"
                      style={{ width: `${60 + Math.random() * 40}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Glow effect behind mockup */}
      <div className="absolute -inset-4 -z-10 rounded-2xl bg-indigo/[0.03] blur-2xl" />
    </div>
  );
}

export default function Hero() {
  return (
    <section className="grain relative flex min-h-screen flex-col justify-center overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-ink) 1px, transparent 1px), linear-gradient(90deg, var(--color-ink) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid items-center gap-16 lg:grid-cols-[1fr,1.1fr]">
          {/* Left: Text content */}
          <div>
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5"
            >
              <Layers size={14} className="text-indigo" />
              <span className="text-xs font-medium text-ink-muted">
                Civic Data Infrastructure
              </span>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="font-display text-5xl leading-[1.08] tracking-tight text-ink md:text-6xl"
            >
              Gram
              <span className="text-indigo">SAMBANDH</span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted"
            >
              Explore local government project records through search, chat, and
              source documents. Making Kerala's Sulekha data searchable and
              understandable.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mt-8 flex items-center gap-4"
            >
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-indigo px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-hover"
              >
                Open Demo
                <ArrowRight size={16} />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink"
              >
                How It Works
              </a>
            </motion.div>
          </div>

          {/* Right: Dashboard mockup */}
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <DashboardMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
