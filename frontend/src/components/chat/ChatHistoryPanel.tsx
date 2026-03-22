import { useEffect, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  MessageSquare,
  Trash2,
  Clock,
  ChevronRight,
} from "lucide-react";
import api from "@/lib/api";
import type { ChatSummary, ChatsListResponse } from "@/types";

interface ChatHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function groupChatsByDate(chats: ChatSummary[]): Record<string, ChatSummary[]> {
  const groups: Record<string, ChatSummary[]> = {
    Today: [],
    Yesterday: [],
    "This Week": [],
    Older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const chat of chats) {
    const chatDate = new Date(chat.updated_at);
    const chatDay = new Date(
      chatDate.getFullYear(),
      chatDate.getMonth(),
      chatDate.getDate()
    );

    if (chatDay.getTime() >= today.getTime()) {
      groups["Today"].push(chat);
    } else if (chatDay.getTime() >= yesterday.getTime()) {
      groups["Yesterday"].push(chat);
    } else if (chatDay.getTime() >= weekAgo.getTime()) {
      groups["This Week"].push(chat);
    } else {
      groups["Older"].push(chat);
    }
  }

  return groups;
}

export default function ChatHistoryPanel({
  isOpen,
  onClose,
  currentChatId,
  onSelectChat,
  onNewChat,
}: ChatHistoryPanelProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ChatsListResponse>("/chats", {
        params: { page: 1, page_size: 50 },
      });
      setChats(data.chats);
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchChats();
    }
  }, [isOpen, fetchChats]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleDelete = async (chatId: string) => {
    try {
      await api.delete(`/chats/${chatId}`);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setDeleteConfirm(null);
      if (currentChatId === chatId) {
        onNewChat();
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  const handleSelectChat = (chatId: string) => {
    onSelectChat(chatId);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  const groupedChats = groupChatsByDate(chats);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[380px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-subtle">
                  <Clock size={18} className="text-indigo" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">
                    Chat History
                  </h2>
                  <p className="text-[10px] text-ink-faint">
                    {chats.length} conversation{chats.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>

            {/* New Chat Button */}
            <div className="border-b border-border p-3">
              <button
                onClick={handleNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo to-indigo-light px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
              >
                <Plus size={16} />
                New Chat
              </button>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
                </div>
              ) : chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-alt">
                    <MessageSquare
                      size={24}
                      className="text-ink-faint"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-sm font-medium text-ink-muted">
                    No conversations yet
                  </p>
                  <p className="mt-1 max-w-[200px] text-xs text-ink-faint">
                    Start a new chat to explore project records
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {Object.entries(groupedChats).map(
                    ([group, groupChats]) =>
                      groupChats.length > 0 && (
                        <div key={group} className="mb-2">
                          <div className="px-4 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                              {group}
                            </span>
                          </div>
                          <div className="space-y-0.5 px-2">
                            {groupChats.map((chat) => (
                              <div
                                key={chat.id}
                                className={`group relative rounded-lg transition-colors ${
                                  currentChatId === chat.id
                                    ? "bg-indigo-subtle"
                                    : "hover:bg-surface-alt"
                                }`}
                              >
                                <button
                                  onClick={() => handleSelectChat(chat.id)}
                                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                                >
                                  <div
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                      currentChatId === chat.id
                                        ? "bg-indigo/20"
                                        : "bg-surface-alt group-hover:bg-surface"
                                    }`}
                                  >
                                    <MessageSquare
                                      size={14}
                                      className={
                                        currentChatId === chat.id
                                          ? "text-indigo"
                                          : "text-ink-faint"
                                      }
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={`truncate text-sm ${
                                        currentChatId === chat.id
                                          ? "font-medium text-indigo"
                                          : "text-ink"
                                      }`}
                                    >
                                      {chat.title || "Untitled Chat"}
                                    </p>
                                    <p className="text-[10px] text-ink-faint">
                                      {formatRelativeTime(chat.updated_at)}
                                    </p>
                                  </div>
                                  <ChevronRight
                                    size={14}
                                    className={`shrink-0 transition-opacity ${
                                      currentChatId === chat.id
                                        ? "text-indigo"
                                        : "text-ink-faint opacity-0 group-hover:opacity-100"
                                    }`}
                                  />
                                </button>

                                {/* Delete button */}
                                {deleteConfirm === chat.id ? (
                                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(chat.id)}
                                      className="rounded bg-error px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-error/80"
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="rounded bg-surface-alt px-2 py-1 text-[10px] font-medium text-ink-muted transition-colors hover:bg-border"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirm(chat.id);
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-faint opacity-0 transition-all hover:bg-error/10 hover:text-error group-hover:opacity-100"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-surface-alt/50 px-4 py-3 text-center">
              <p className="text-[10px] text-ink-faint">
                Press{" "}
                <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[9px]">
                  Esc
                </kbd>{" "}
                to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
