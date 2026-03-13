import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageSquareText } from "lucide-react";
import api from "@/lib/api";
import type { ChatMessage, ChatSource, Chunk } from "@/types";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import DocumentViewer from "@/components/viewer/DocumentViewer";

export default function ChatbotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{
    id: string;
    chunks: Chunk[];
    district?: string;
    projectNo?: string;
    lbName?: string;
    year?: string;
  } | null>(null);
  const [highlightChunk, setHighlightChunk] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const { data } = await api.post("/chat", { message: text });
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.response,
          sources: data.sources?.map((s: any) => ({
            document_id: s.document_id,
            document_title: `${s.district || "Unknown"} — ${s.project_no || "N/A"}`,
            chunk_id: s.chunk_id,
            excerpt: s.excerpt,
            page: s.page,
          })),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSourceClick = useCallback(async (source: ChatSource) => {
    try {
      const { data } = await api.get(`/documents/${source.document_id}`);
      setViewerDoc({
        id: source.document_id,
        chunks: data.chunks || [],
        district: data.district,
        projectNo: data.project_no,
        lbName: data.lb_name,
        year: data.year,
      });
      setHighlightChunk(source.chunk_id);
    } catch {
      /* silently fail */
    }
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full"
    >
      {/* Chat panel */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-xl text-ink">Chatbot</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Ask questions about Sulekha project records — answers are grounded in retrieved content
          </p>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-subtle">
                <MessageSquareText size={28} className="text-indigo" strokeWidth={1.4} />
              </div>
              <h3 className="font-display text-xl text-ink">
                What would you like to know?
              </h3>
              <p className="mt-2 max-w-md text-center text-sm text-ink-muted">
                Ask questions about Kerala's local government project records.
                Answers are sourced from Sulekha documents.
              </p>
              <div className="mt-8 max-w-lg">
                <SuggestedPrompts onSelect={sendMessage} />
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-6 py-4">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSourceClick={handleSourceClick}
                />
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-subtle">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-indigo/50" />
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-4 py-3">
                    <div className="flex gap-1">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: "0ms" }} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: "150ms" }} />
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={sendMessage} onClear={() => setMessages([])} disabled={loading} />
      </div>

      {/* Evidence panel */}
      {viewerDoc && (
        <div className="w-[440px] shrink-0 border-l border-border">
          <DocumentViewer
            documentId={viewerDoc.id}
            title={`${viewerDoc.district || ""} — ${viewerDoc.projectNo || ""}`}
            projectNo={viewerDoc.projectNo}
            district={viewerDoc.district}
            lbName={viewerDoc.lbName}
            year={viewerDoc.year}
            chunks={viewerDoc.chunks}
            highlightChunkId={highlightChunk}
            onClose={() => setViewerDoc(null)}
          />
        </div>
      )}
    </motion.div>
  );
}
