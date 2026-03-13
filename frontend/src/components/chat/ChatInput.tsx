import { useState, useRef, useEffect } from "react";
import { Send, RotateCcw } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onClear, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-border bg-surface px-4 py-3">
      <button
        onClick={onClear}
        className="mb-0.5 rounded-md p-2 text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink-muted"
        title="Clear conversation"
      >
        <RotateCcw size={16} />
      </button>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask a question about Sulekha records..."
        rows={1}
        className="flex-1 resize-none rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-indigo focus:outline-none disabled:opacity-50"
        style={{ minHeight: 38, maxHeight: 120 }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = Math.min(el.scrollHeight, 120) + "px";
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo text-white transition-colors hover:bg-indigo-hover disabled:opacity-40"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
