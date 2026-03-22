import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquareText, Sparkles, History, Plus } from "lucide-react";
import api from "@/lib/api";
import type { ChatSource, ChatMessage, ChatDetail } from "@/types";
import useChatStream from "@/hooks/useChatStream";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import SourceDrawer from "@/components/chat/SourceDrawer";
import ChatHistoryPanel from "@/components/chat/ChatHistoryPanel";

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
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const {
    messages,
    isStreaming,
    isThinking,
    sendMessage,
    stopGeneration,
    clearHistory,
    setMessages,
  } = useChatStream({
    chatId: currentChatId,
    onChatCreated: (chatId) => {
      setCurrentChatId(chatId);
    },
    onTitleGenerated: (title) => {
      setCurrentTitle(title);
    },
  });

  const [drawer, setDrawer] = useState<DrawerState>({
    isOpen: false,
    documentId: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 150;
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

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      try {
        const { data } = await api.get<ChatDetail>(`/chats/${chatId}`);
        setCurrentChatId(chatId);
        setCurrentTitle(data.title);

        // Convert backend messages to frontend format
        const loadedMessages: ChatMessage[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources || undefined,
          toolCalls: m.tool_calls || undefined,
          timestamp: new Date(m.created_at),
        }));

        setMessages(loadedMessages);
      } catch (err) {
        console.error("Failed to load chat:", err);
      }
    },
    [setMessages]
  );

  const handleNewChat = useCallback(() => {
    setCurrentChatId(null);
    setCurrentTitle(null);
    clearHistory();
  }, [clearHistory]);

  const hasMessages = messages.length > 0;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full flex-col"
      >
        {/* Header */}
        <div className="relative z-20 border-b border-border bg-gradient-to-r from-surface via-surface to-indigo-subtle/20 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo to-indigo-light shadow-md">
                <MessageSquareText
                  size={20}
                  className="text-white"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <h2 className="font-display text-lg text-ink sm:text-xl">
                  {currentTitle || "Chatbot"}
                </h2>
                <p className="text-[11px] text-ink-muted sm:text-xs">
                  {currentChatId
                    ? "Continue your conversation"
                    : "Ask questions about Sulekha project records"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasMessages && (
                <button
                  onClick={handleNewChat}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-muted transition-colors hover:border-indigo/30 hover:bg-indigo-subtle hover:text-indigo"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">New Chat</span>
                </button>
              )}
              <button
                onClick={() => setHistoryOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:border-indigo/30 hover:bg-indigo-subtle hover:text-indigo"
                title="Chat History"
              >
                <History size={16} />
              </button>
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
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isThinking={isThinking && idx === messages.length - 1}
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

      {/* Chat History Panel */}
      <ChatHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />
    </>
  );
}
