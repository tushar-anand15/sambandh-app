import { motion } from "framer-motion";
import { Route, Droplets, BarChart3, Search, FileText, Building2 } from "lucide-react";

const prompts = [
  {
    icon: Route,
    category: "Infrastructure",
    text: "What road construction projects are in Chalakkudy?",
    color: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-600",
  },
  {
    icon: Droplets,
    category: "Water",
    text: "List drinking water projects in Grama Panchayats",
    color: "from-blue-500/10 to-cyan-500/10",
    iconColor: "text-blue-600",
  },
  {
    icon: BarChart3,
    category: "Compare",
    text: "Compare spending between Adat and Athirappally panchayats",
    color: "from-emerald-500/10 to-teal-500/10",
    iconColor: "text-emerald-600",
  },
  {
    icon: FileText,
    category: "Details",
    text: "What is project 273 in Chalakkudy about?",
    color: "from-violet-500/10 to-purple-500/10",
    iconColor: "text-violet-600",
  },
  {
    icon: Building2,
    category: "Overview",
    text: "How many projects does Thrissur Corporation have?",
    color: "from-rose-500/10 to-pink-500/10",
    iconColor: "text-rose-600",
  },
  {
    icon: Search,
    category: "Malayalam",
    text: "റോഡ് നിർമ്മാണ പദ്ധതികൾ",
    color: "from-indigo-500/10 to-blue-500/10",
    iconColor: "text-indigo",
  },
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((p, i) => {
        const Icon = p.icon;
        return (
          <motion.button
            key={p.text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            onClick={() => onSelect(p.text)}
            className={`group relative flex items-start gap-3 rounded-xl border border-border bg-gradient-to-br ${p.color} p-3 text-left transition-all hover:border-indigo/30 hover:shadow-md sm:p-4`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface shadow-sm ${p.iconColor}`}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {p.category}
              </span>
              <p className="mt-0.5 text-xs leading-relaxed text-ink group-hover:text-indigo sm:text-sm">
                {p.text}
              </p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
