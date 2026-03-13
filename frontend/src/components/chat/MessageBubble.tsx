import { User, Bot } from "lucide-react";
import type { ChatMessage, ChatSource } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onSourceClick?: (source: ChatSource) => void;
}

export default function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-subtle">
          <Bot size={14} className="text-indigo" />
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? "order-first" : ""}`}>
        <div
          className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo text-white"
              : "border border-border bg-surface text-ink"
          }`}
        >
          {message.content}
        </div>

        {/* Source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Sources
            </p>
            {message.sources.map((source) => (
              <button
                key={source.chunk_id}
                onClick={() => onSourceClick?.(source)}
                className="block w-full rounded-lg border border-border bg-surface p-2.5 text-left transition-colors hover:border-indigo/20 hover:bg-indigo-subtle/30"
              >
                <p className="text-xs font-medium text-ink">
                  {source.document_title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-muted">
                  {source.excerpt}
                </p>
                <p className="mt-1 font-mono text-[10px] text-ink-faint">
                  Page {source.page}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-alt">
          <User size={14} className="text-ink-muted" />
        </div>
      )}
    </div>
  );
}
