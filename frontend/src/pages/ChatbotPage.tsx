import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareText, Sparkles } from "lucide-react";
import api from "@/lib/api";
import type { ChatSource } from "@/types";
import useChatStream from "@/hooks/useChatStream";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import SourceDrawer from "@/components/chat/SourceDrawer";

interface DrawerState {
  isOpen: boolean;
  documentId: string | null;
  documentTitle?: string;
  lbName?: string;
  district?: string;
  year?: string;
  projectNo?: string;
  page?: number;
}

export default function ChatbotPage() {
  const { messages, isStreaming, sendMessage, stopGeneration, clearHistory } =
    useChatStream();

  const [drawer, setDrawer] = useState<DrawerState>({
    isOpen: false,
    documentId: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
      if (isNearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages]);

  const handleSourceClick = useCallback(async (source: ChatSource) => {
    try {
      const { data } = await api.get(`/documents/${source.document_id}`);
      setDrawer({
        isOpen: true,
        documentId: source.document_id,
        documentTitle: source.document_title || data.title,
        lbName: source.lb_name || data.lb_name,
        district: data.district,
        year: data.year,
        projectNo: data.project_no,
        page: source.page,
      });
    } catch {
      setDrawer({
        isOpen: true,
        documentId: source.document_id,
        documentTitle: source.document_title,
        lbName: source.lb_name,
        page: source.page,
      });
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full flex-col"
      >
        {/* Header */}
        <div className="relative border-b border-border bg-gradient-to-r from-surface via-surface to-indigo-subtle/20 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo to-indigo-light shadow-md">
              <MessageSquareText size={20} className="text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-display text-lg text-ink sm:text-xl">Chatbot</h2>
              <p className="text-[11px] text-ink-muted sm:text-xs">
                Ask questions about Sulekha project records
              </p>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {!hasMessages ? (
            <div className="flex h-full flex-col items-center justify-center px-4 py-8 sm:px-6">
              {/* Decorative background */}
              <div className="absolute inset-0 overflow-hidden opacity-30">
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-subtle to-transparent blur-3xl" />
                <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-gradient-to-tr from-indigo-subtle to-transparent blur-3xl" />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative z-10 flex flex-col items-center"
              >
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo to-indigo-light shadow-lg sm:h-20 sm:w-20">
                  <Sparkles size={32} className="text-white" strokeWidth={1.5} />
                </div>
                <h3 className="text-center font-display text-xl text-ink sm:text-2xl">
                  What would you like to know?
                </h3>
                <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-ink-muted">
                  Ask questions about Kerala's local government project records.
                  Answers are sourced from Sulekha documents with citations.
                </p>
                <div className="mt-8 w-full max-w-xl">
                  <SuggestedPrompts onSelect={sendMessage} />
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSourceClick={handleSourceClick}
                />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          onStop={stopGeneration}
          onClear={clearHistory}
          disabled={false}
          isStreaming={isStreaming}
        />
      </motion.div>

      {/* Source Drawer */}
      <SourceDrawer
        isOpen={drawer.isOpen}
        onClose={closeDrawer}
        documentId={drawer.documentId}
        documentTitle={drawer.documentTitle}
        lbName={drawer.lbName}
        district={drawer.district}
        year={drawer.year}
        projectNo={drawer.projectNo}
        initialPage={drawer.page}
      />
    </>
  );
}
