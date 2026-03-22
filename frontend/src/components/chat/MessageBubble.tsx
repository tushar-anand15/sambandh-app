import { useState } from "react";
import { motion } from "framer-motion";
import { User, Bot, ChevronDown, Search, FileText, BarChart3, List, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatSource, ToolCallEvent } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onSourceClick?: (source: ChatSource) => void;
}

const TOOL_ICONS: Record<string, typeof Search> = {
  search_documents: Search,
  get_project_details: FileText,
  compare_projects: BarChart3,
  list_projects: List,
};

const TOOL_LABELS: Record<string, string> = {
  search_documents: "Searching documents",
  get_project_details: "Looking up project",
  compare_projects: "Comparing projects",
  list_projects: "Listing projects",
};

function ToolCallBadge({ tc, isStreaming }: { tc: ToolCallEvent; isStreaming?: boolean }) {
  const Icon = TOOL_ICONS[tc.tool] || Search;
  const label = TOOL_LABELS[tc.tool] || tc.tool;
  const isRunning = tc.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        isRunning
          ? "border-indigo/30 bg-indigo-subtle shimmer"
          : "border-border bg-surface-alt"
      }`}
    >
      <Icon
        size={14}
        className={isRunning ? "text-indigo" : "text-ink-faint"}
      />
      <span className={isRunning ? "font-medium text-indigo" : "text-ink-muted"}>
        {label}
        {isRunning && "..."}
      </span>
      {isRunning && (
        <span className="ml-1 flex gap-0.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo" style={{ animationDelay: "300ms" }} />
        </span>
      )}
      {!isRunning && (
        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
          Done
        </span>
      )}
    </motion.div>
  );
}

function SourceChip({ source, onClick }: { source: ChatSource; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-all hover:border-indigo/30 hover:bg-indigo-subtle/50 hover:shadow-sm"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-subtle">
        <FileText size={14} className="text-indigo" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">
          {source.document_title}
        </p>
        <p className="truncate text-[10px] text-ink-muted">
          {source.lb_name && `${source.lb_name} · `}Page {source.page}
        </p>
      </div>
      <ExternalLink
        size={12}
        className="shrink-0 text-ink-faint transition-colors group-hover:text-indigo"
      />
    </button>
  );
}

export default function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const [showTools, setShowTools] = useState(false);
  const isUser = message.role === "user";
  const hasTools = message.toolCalls && message.toolCalls.length > 0;
  const hasRunningTools = message.toolCalls?.some((tc) => tc.status === "running");
  const showToolsExpanded = message.isStreaming || hasRunningTools;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "justify-end" : ""}`}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo to-indigo-light shadow-sm">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div className={`max-w-[85%] min-w-0 ${isUser ? "order-first" : ""}`}>
        {/* Tool calls - expanded during streaming, collapsible after */}
        {!isUser && hasTools && (
          <div className="mb-3">
            {!showToolsExpanded && (
              <button
                onClick={() => setShowTools(!showTools)}
                className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${showTools ? "rotate-0" : "-rotate-90"}`}
                />
                {message.toolCalls!.length} tool call{message.toolCalls!.length > 1 ? "s" : ""} completed
              </button>
            )}
            {(showToolsExpanded || showTools) && (
              <div className="flex flex-col gap-2">
                {message.toolCalls!.map((tc, i) => (
                  <ToolCallBadge
                    key={`${tc.tool}-${i}`}
                    tc={tc}
                    isStreaming={message.isStreaming}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        {(message.content || !hasRunningTools) && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-gradient-to-br from-indigo to-indigo-light text-white shadow-md"
                : "border-l-2 border-l-indigo/20 bg-surface text-ink shadow-sm"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && message.content && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo" />
                )}
              </div>
            )}
          </div>
        )}

        {/* Source citations as chips */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-3"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              References ({message.sources.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.sources.map((source) => (
                <SourceChip
                  key={source.chunk_id}
                  source={source}
                  onClick={() => onSourceClick?.(source)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt shadow-sm">
          <User size={16} className="text-ink-muted" />
        </div>
      )}
    </motion.div>
  );
}
