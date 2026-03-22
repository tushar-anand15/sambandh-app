import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Square, RotateCcw } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  onClear: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export default function ChatInput({ onSend, onStop, onClear, disabled, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-gradient-to-t from-surface to-surface/80 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-4">
      <div className="mx-auto max-w-3xl">
        <motion.div
          animate={{
            boxShadow: isFocused
              ? "0 4px 20px rgba(49, 46, 129, 0.15)"
              : "0 2px 8px rgba(0, 0, 0, 0.05)",
          }}
          className={`flex items-end gap-2 rounded-2xl border bg-surface p-2 transition-colors sm:gap-3 sm:p-3 ${
            isFocused ? "border-indigo/40" : "border-border"
          }`}
        >
          <button
            onClick={onClear}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink-muted sm:h-10 sm:w-10"
            title="Clear conversation"
          >
            <RotateCcw size={16} className="sm:h-[18px] sm:w-[18px]" />
          </button>

          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled || isStreaming}
            placeholder="Ask about Sulekha project records..."
            rows={1}
            className="flex-1 resize-none bg-transparent py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none disabled:opacity-50 sm:text-base"
            style={{ minHeight: 36, maxHeight: 120 }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />

          {isStreaming ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onStop}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-error/30 bg-error/10 text-error transition-colors hover:bg-error/20 sm:h-10 sm:w-10"
              title="Stop generating"
            >
              <Square size={14} className="sm:h-4 sm:w-4" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo to-indigo-light text-white shadow-md transition-all hover:shadow-lg disabled:opacity-40 disabled:shadow-none sm:h-10 sm:w-10"
            >
              <Send size={16} className="sm:h-[18px] sm:w-[18px]" />
            </motion.button>
          )}
        </motion.div>

        <p className="mt-2 text-center text-[10px] text-ink-faint sm:text-[11px]">
          Press <kbd className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to send,{" "}
          <kbd className="rounded bg-surface-alt px-1 py-0.5 font-mono text-[9px]">Shift + Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
