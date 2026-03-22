import { motion } from "framer-motion";
import { ArrowRight, Layers, Bot, User, MessageSquareText, Search, Send, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

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

const mockMessages = [
  {
    role: "user" as const,
    content: "What road projects are in Chalakkudy?",
  },
  {
    role: "assistant" as const,
    content: "I found 3 road construction projects in Chalakkudy Municipality:\n\n**Project 308** - Construction of road at Ammarthodu Chira\n**Project 261** - Concrete road on west side of St Joseph Chappel\n**Project 464** - Road towards Mahagani Thottam",
    sources: [
      { title: "Project 308 — Chalakkudy", page: 1 },
      { title: "Project 261 — Chalakkudy", page: 1 },
    ],
  },
];

function ChatPreview() {
  const [visibleMessages, setVisibleMessages] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setVisibleMessages(1), 500);
    const timer2 = setTimeout(() => setIsTyping(true), 1200);
    const timer3 = setTimeout(() => {
      setIsTyping(false);
      setVisibleMessages(2);
    }, 2500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[580px]">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-error/60" />
          <div className="h-2 w-2 rounded-full bg-warning/60" />
          <div className="h-2 w-2 rounded-full bg-success/60" />
          <div className="ml-2 flex items-center gap-1.5 text-[10px] text-ink-muted">
            <MessageSquareText size={10} />
            <span>Chatbot</span>
          </div>
        </div>

        {/* App frame */}
        <div className="flex h-[280px]">
          {/* Mini sidebar */}
          <div className="w-[52px] shrink-0 border-r border-border bg-surface-alt p-2">
            <div className="mb-3 text-center font-display text-[8px] font-bold text-indigo">GS</div>
            <div className="space-y-1">
              <div className="flex h-7 w-full items-center justify-center rounded-md bg-indigo-subtle">
                <MessageSquareText size={12} className="text-indigo" />
              </div>
              <div className="flex h-7 w-full items-center justify-center rounded-md text-ink-faint hover:bg-surface">
                <Search size={12} />
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex flex-1 flex-col">
            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-hidden p-3">
              {visibleMessages >= 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="flex items-start gap-1.5">
                    <div className="max-w-[200px] rounded-xl bg-gradient-to-br from-indigo to-indigo-light px-2.5 py-1.5 text-[9px] leading-relaxed text-white">
                      {mockMessages[0].content}
                    </div>
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-alt">
                      <User size={10} className="text-ink-muted" />
                    </div>
                  </div>
                </motion.div>
              )}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-1.5"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo to-indigo-light">
                    <Bot size={10} className="text-white" />
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-2.5 py-1.5">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </motion.div>
              )}

              {visibleMessages >= 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-1.5"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo to-indigo-light">
                    <Bot size={10} className="text-white" />
                  </div>
                  <div className="max-w-[280px]">
                    <div className="rounded-xl border-l-2 border-l-indigo/20 bg-surface px-2.5 py-1.5 text-[9px] leading-relaxed text-ink shadow-sm">
                      <p className="mb-1">I found 3 road construction projects in Chalakkudy Municipality:</p>
                      <p className="font-medium">Project 308</p>
                      <p className="text-ink-muted">Construction of road at Ammarthodu Chira</p>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {mockMessages[1].sources?.map((s, i) => (
                        <div key={i} className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[8px] text-ink-muted border border-border">
                          <FileText size={8} />
                          <span className="truncate max-w-[60px]">{s.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border bg-surface/80 p-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
                <input
                  type="text"
                  placeholder="Ask about projects..."
                  className="flex-1 bg-transparent text-[9px] text-ink placeholder:text-ink-faint focus:outline-none"
                  readOnly
                />
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-indigo to-indigo-light">
                  <Send size={9} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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

          {/* Right: Live chat preview */}
          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
          >
            <ChatPreview />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
