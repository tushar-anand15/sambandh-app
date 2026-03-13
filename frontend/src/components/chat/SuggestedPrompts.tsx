const prompts = [
  "What projects were funded in Thiruvananthapuram in 2023?",
  "Show me road construction projects in Ernakulam",
  "Which local bodies had the highest spending last year?",
  "Find water supply projects in Malappuram",
  "What are the most common project categories?",
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-muted transition-all hover:border-indigo/30 hover:bg-indigo-subtle hover:text-indigo"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
