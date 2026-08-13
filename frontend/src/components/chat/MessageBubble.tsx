import { useState } from "react";
import {
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Search,
  FileText,
  BarChart3,
  List,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatSource, ToolCallEvent } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isThinking?: boolean;
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
  get_project_details: "Looking up project details",
  compare_projects: "Comparing projects",
  list_projects: "Listing projects",
};

function ThinkingIndicator() {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-indigo/20 bg-gradient-to-r from-indigo-subtle/50 to-indigo-subtle/30 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo/10">
        <Sparkles size={16} className="animate-pulse text-indigo" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-indigo">Thinking...</p>
        <p className="text-xs text-ink-muted">Analyzing your question</p>
      </div>
      <div className="flex gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo/60" style={{ animationDelay: "0ms" }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo/60" style={{ animationDelay: "150ms" }} />
        <span className="h-2 w-2 animate-bounce rounded-full bg-indigo/60" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function ToolCallCard({ tc, isExpanded, onToggle }: { tc: ToolCallEvent; isExpanded: boolean; onToggle: () => void }) {
  const Icon = TOOL_ICONS[tc.tool] || Search;
  const label = TOOL_LABELS[tc.tool] || tc.tool;
  const isRunning = tc.status === "running";

  return (
    <div
      className={`overflow-hidden rounded-xl border transition-all ${
        isRunning
          ? "border-indigo/30 bg-gradient-to-r from-indigo-subtle/60 to-indigo-subtle/40"
          : "border-border bg-surface-alt/50"
      }`}>
      {/* Header - always visible */}
      <button
        onClick={onToggle}
        disabled={isRunning}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-alt/50 disabled:cursor-default"
      >
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          isRunning ? "bg-indigo/20" : "bg-surface"
        }`}>
          {isRunning ? (
            <Loader2 size={16} className="animate-spin text-indigo" />
          ) : (
            <Icon size={16} className="text-ink-muted" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${isRunning ? "text-indigo" : "text-ink"}`}>
              {label}
            </span>
            {!isRunning && (
              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                <CheckCircle2 size={10} />
                Done
              </span>
            )}
          </div>
          {/* Show input parameters */}
          {tc.input && Object.keys(tc.input).length > 0 && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {Object.entries(tc.input)
                .filter(([_, v]) => v)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          )}
        </div>
        {!isRunning && tc.output && (
          <ChevronRight
            size={16}
            className={`shrink-0 text-ink-faint transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        )}
      </button>

      {/* Expanded output */}
        {isExpanded && tc.output && !isRunning && (
          <div
            className="overflow-hidden">
            <div className="border-t border-border/50 bg-canvas/50 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Tool Output
              </p>
              <div className="max-h-[300px] overflow-auto rounded-lg bg-surface p-3">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-muted">
                  {tc.output}
                </pre>
              </div>
            </div>
          </div>
        )}
    </div>
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

export default function MessageBubble({ message, isThinking, onSourceClick }: MessageBubbleProps) {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [showAllTools, setShowAllTools] = useState(false);
  
  const isUser = message.role === "user";
  const hasTools = message.toolCalls && message.toolCalls.length > 0;
  const hasRunningTools = message.toolCalls?.some((tc) => tc.status === "running");
  const showThinking = !isUser && message.isStreaming && isThinking && !hasTools && !message.content;

  const toggleTool = (index: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div
      className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo to-indigo-light shadow-sm">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div className={`max-w-[85%] min-w-0 space-y-3 ${isUser ? "order-first" : ""}`}>
        {/* Thinking indicator */}
        {showThinking && <ThinkingIndicator />}

        {/* Tool calls - show all during streaming, collapsible after */}
        {!isUser && hasTools && (
          <div className="space-y-2">
            {/* Show/hide toggle for completed tools */}
            {!message.isStreaming && !hasRunningTools && message.toolCalls!.length > 0 && (
              <button
                onClick={() => setShowAllTools(!showAllTools)}
                className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronDown
                  size={12}
                  className={`transition-transform ${showAllTools ? "rotate-0" : "-rotate-90"}`}
                />
                {message.toolCalls!.length} tool call{message.toolCalls!.length > 1 ? "s" : ""} completed
              </button>
            )}

            {/* Tool cards */}
            {(message.isStreaming || hasRunningTools || showAllTools) && (
              <div className="space-y-2">
                {message.toolCalls!.map((tc, i) => (
                  <ToolCallCard
                    key={`${tc.tool}-${i}`}
                    tc={tc}
                    isExpanded={expandedTools.has(i)}
                    onToggle={() => toggleTool(i)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        {(message.content || (!showThinking && !hasRunningTools)) && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-gradient-to-br from-indigo to-indigo-light text-white shadow-md"
                : "border-l-2 border-l-indigo/20 bg-surface text-ink shadow-sm"
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : message.content ? (
              <div className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo" />
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Source citations as chips */}
        {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div>
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
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-alt shadow-sm">
          <User size={16} className="text-ink-muted" />
        </div>
      )}
    </div>
  );
}
