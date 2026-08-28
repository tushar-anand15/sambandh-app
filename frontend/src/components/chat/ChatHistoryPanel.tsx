/**
 * Past conversations.
 *
 * The reason an account exists at all: the finances, meetings and elections
 * sections answer with no token, and the only thing signing in buys is that
 * your questions and their answers are still here tomorrow. So the panel is
 * plain — a date grouping, a title, when it was last touched, and a way to
 * throw one away.
 *
 * Deleting asks first, in place. A conversation is the only thing on this site
 * a reader can destroy.
 */

import { useEffect, useCallback, useState } from "react";

import api from "@/lib/api";
import type { ChatSummary, ChatsListResponse } from "@/types";

import styles from "./chat.module.css";

interface ChatHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

const GROUPS = ["Today", "Yesterday", "This week", "Older"] as const;

export function groupChatsByDate(chats: ChatSummary[]): Record<string, ChatSummary[]> {
  const groups: Record<string, ChatSummary[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const chat of chats) {
    const at = new Date(chat.updated_at);
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());

    if (day.getTime() >= today.getTime()) groups.Today.push(chat);
    else if (day.getTime() >= yesterday.getTime()) groups.Yesterday.push(chat);
    else if (day.getTime() >= weekAgo.getTime()) groups["This week"].push(chat);
    else groups.Older.push(chat);
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
  const [confirming, setConfirming] = useState<string | null>(null);

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
    if (isOpen) fetchChats();
  }, [isOpen, fetchChats]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleDelete = async (chatId: string) => {
    try {
      await api.delete(`/chats/${chatId}`);
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setConfirming(null);
      if (currentChatId === chatId) onNewChat();
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  if (!isOpen) return null;

  const grouped = groupChatsByDate(chats);

  return (
    <div className={styles.scrim}>
      <button
        type="button"
        className={styles.veil}
        onClick={onClose}
        data-testid="history-backdrop"
        aria-label="Close past conversations"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Past conversations"
        data-testid="chat-history"
        className={`${styles.panel} ${styles.panelNarrow}`}
      >
        <header className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Past conversations</h2>
            <p className={styles.panelMeta}>
              {chats.length} saved{chats.length === 1 ? " conversation" : " conversations"}
            </p>
          </div>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              onNewChat();
              onClose();
            }}
          >
            New chat
          </button>
        </header>

        <div className={styles.panelBody}>
          {loading ? (
            <p className="selector-status" aria-busy="true">
              Loading your conversations.
            </p>
          ) : chats.length === 0 ? (
            <p className={styles.empty}>
              Nothing saved yet. Questions you ask are kept here so you can come
              back to the answers.
            </p>
          ) : (
            GROUPS.map((group) =>
              grouped[group].length > 0 ? (
                <div key={group}>
                  <p className={styles.groupLabel}>{group}</p>
                  {grouped[group].map((chat) => (
                    <div key={chat.id} className={styles.chat}>
                      <button
                        type="button"
                        className={
                          currentChatId === chat.id
                            ? `${styles.chatOpen} ${styles.chatCurrent}`
                            : styles.chatOpen
                        }
                        onClick={() => {
                          onSelectChat(chat.id);
                          onClose();
                        }}
                      >
                        {chat.title || "Untitled conversation"}
                      </button>

                      <span className={styles.chatTime}>
                        {formatRelativeTime(chat.updated_at)}
                      </span>

                      {confirming === chat.id ? (
                        <>
                          <button
                            type="button"
                            className={styles.action}
                            onClick={() => handleDelete(chat.id)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className={styles.action}
                            onClick={() => setConfirming(null)}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.action}
                          onClick={() => setConfirming(chat.id)}
                          aria-label={`Delete ${chat.title || "this conversation"}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null,
            )
          )}
        </div>

        <footer className={styles.panelFoot}>Esc closes this panel.</footer>
      </aside>
    </div>
  );
}
