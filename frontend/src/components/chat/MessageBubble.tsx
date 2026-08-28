/**
 * One turn of the conversation.
 *
 * Not a bubble any more, whatever the file is called: a rule, a label naming
 * who is speaking, and the words. The reader's question is set in the display
 * face at the one size above body; the answer is markdown through `.prose-chat`.
 *
 * Citations sit under the answer as underlined chips. The backend writes each
 * source's title as "Project {no} — {local body}", so the chip already names
 * both, and clicking it opens the scan that sentence was read from. An answer
 * whose citations cannot be opened is an assertion, and this assistant is not
 * allowed to make assertions.
 */

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChatMessage, ChatSource, ToolCallEvent } from "@/types";

import styles from "./chat.module.css";

interface MessageBubbleProps {
  message: ChatMessage;
  isThinking?: boolean;
  onSourceClick?: (source: ChatSource) => void;
}

const TOOL_LABELS: Record<string, string> = {
  search_documents: "Searched the documents",
  get_project_details: "Looked up a project",
  compare_projects: "Compared projects",
  list_projects: "Listed projects",
};

function toolLabel(tc: ToolCallEvent): string {
  return TOOL_LABELS[tc.tool] ?? tc.tool;
}

/** "Project 2023-24/GP/1147 — Amboori, p. 3". */
export function citationLabel(source: ChatSource): string {
  const title = source.document_title || "Document";
  const named = source.lb_name && !title.includes(source.lb_name)
    ? `${title} — ${source.lb_name}`
    : title;
  return source.page ? `${named}, p. ${source.page}` : named;
}

function ToolCalls({ calls }: { calls: ToolCallEvent[] }) {
  const [shown, setShown] = useState<number | null>(null);
  const running = calls.some((tc) => tc.status === "running");
  const [open, setOpen] = useState(false);

  if (!running && !open) {
    return (
      <div className={styles.tools}>
        <button
          type="button"
          className={styles.toolToggle}
          onClick={() => setOpen(true)}
        >
          {calls.length} step{calls.length > 1 ? "s" : ""} before answering
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tools}>
      {!running ? (
        <button
          type="button"
          className={styles.toolToggle}
          onClick={() => setOpen(false)}
        >
          Hide the steps
        </button>
      ) : null}

      {calls.map((tc, i) => (
        <div key={`${tc.tool}-${i}`} className={styles.tool}>
          <span className={styles.toolName}>{toolLabel(tc)}</span>
          {tc.status === "running" ? <span className={styles.caret} /> : null}
          {tc.output ? (
            <>
              {" · "}
              <button
                type="button"
                className={styles.toolToggle}
                onClick={() => setShown(shown === i ? null : i)}
              >
                {shown === i ? "Hide what it read" : "What it read"}
              </button>
              {shown === i ? <pre className={styles.toolOutput}>{tc.output}</pre> : null}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function MessageBubble({
  message,
  isThinking,
  onSourceClick,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const calls = message.toolCalls ?? [];
  const hasRunningTools = calls.some((tc) => tc.status === "running");
  const showThinking =
    !isUser && message.isStreaming && isThinking && calls.length === 0 && !message.content;

  if (isUser) {
    return (
      <div className={styles.turn}>
        <p className={styles.who}>Asked</p>
        <p className={styles.question}>{message.content}</p>
      </div>
    );
  }

  return (
    <div className={styles.turn}>
      <p className={styles.who}>From the sanctioning documents</p>

      {showThinking ? (
        <p className={styles.thinking}>
          Reading the project documents
          <span className={styles.caret} />
        </p>
      ) : null}

      {calls.length > 0 ? <ToolCalls calls={calls} /> : null}

      {message.content ? (
        <div className="prose-chat">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          {message.isStreaming ? <span className={styles.caret} /> : null}
        </div>
      ) : null}

      {!message.content && !showThinking && !hasRunningTools ? (
        <p className={styles.empty}>No answer came back. Ask again.</p>
      ) : null}

      {message.sources && message.sources.length > 0 && !message.isStreaming ? (
        <div className={styles.cites}>
          <span className={styles.citesLabel}>From</span>
          {message.sources.map((source) => (
            <button
              key={source.chunk_id}
              type="button"
              className={styles.cite}
              onClick={() => onSourceClick?.(source)}
            >
              {citationLabel(source)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
