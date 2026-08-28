/**
 * The assistant.
 *
 * An application shell, not a page: a header strip, a transcript that scrolls
 * on its own, and a composer pinned to the bottom. The revamp turned it into a
 * scrolling document, which put the question box below the fold the moment an
 * answer arrived. This restores the structure the pre-revamp version had and
 * none of its styling.
 *
 * The opening copy is GS's own, from page 7 of his review, verbatim. So is the
 * note above the composer, which stays on screen for the whole conversation:
 * the size of the library is the single fact that decides how much weight an
 * answer here carries, and it is the one a reader forgets first.
 */

import { useRef, useEffect, useCallback, useState } from "react";

import api from "@/lib/api";
import type { ChatSource, ChatMessage, ChatDetail } from "@/types";
import useChatStream from "@/hooks/useChatStream";
import { useAuth } from "@/hooks/useAuth";
import SuggestedPrompts from "@/components/chat/SuggestedPrompts";
import ChatInput from "@/components/chat/ChatInput";
import MessageBubble from "@/components/chat/MessageBubble";
import SourceDrawer from "@/components/chat/SourceDrawer";
import ChatHistoryPanel from "@/components/chat/ChatHistoryPanel";
import CoverageBanner, { useAssistantIndex } from "@/components/chat/CoverageBanner";
import ScopeSelector, { scopedQuestion } from "@/components/chat/ScopeSelector";

import styles from "@/components/chat/chat.module.css";

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
  // The local body a question is about, empty when the reader has not narrowed
  // it. Restricted to the indexed bodies; see ScopeSelector.
  const [scopeBody, setScopeBody] = useState("");

  const { logout } = useAuth();
  const index = useAssistantIndex();
  const indexedBodies = index.status === "ready" ? index.index.local_bodies : [];

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

  // Follow the answer down, but only for a reader who was already at the
  // bottom: yanking the view back while someone is reading three turns up is
  // the most annoying thing a transcript can do. `scrollTo` is guarded because
  // jsdom does not implement it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0 || typeof el.scrollTo !== "function") return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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

  const askScoped = useCallback(
    (text: string) => sendMessage(scopedQuestion(scopeBody, text)),
    [scopeBody, sendMessage],
  );

  const hasMessages = messages.length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.strip}>
        <h2 className={styles.stripTitle}>{currentTitle || "Assistant"}</h2>

        <div className={styles.stripActions}>
          <button
            type="button"
            className={styles.action}
            onClick={handleNewChat}
            disabled={!hasMessages}
          >
            New chat
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => setHistoryOpen(true)}
          >
            Past conversations
          </button>
          <button type="button" className={styles.action} onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <div ref={scrollRef} className={styles.stream}>
        <div className={styles.streamInner}>
          {!hasMessages ? (
            <>
              <p className="label">Assistant</p>
              <h1>Reading the project documents</h1>
              <p className="lede">
                Ask it about a project you saw in the explorer in words, in
                English or Malayalam, and the assistant answers from the
                sanctioning documents it has read, quoting the project number
                and local body each answer comes from. It answers only from
                those documents.
              </p>

              {/* What it has actually read, counted off the corpus. */}
              <CoverageBanner state={index} />

              <SuggestedPrompts onSelect={askScoped} />
            </>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isThinking={isThinking && idx === messages.length - 1}
                onSourceClick={handleSourceClick}
              />
            ))
          )}
        </div>
      </div>

      <div className={styles.foot}>
        <div className={styles.footInner}>
          <p className={styles.footCaveat}>
            <span className={styles.caveatLabel}>Note</span>
            <br />
            Assistant library is far smaller than the rest of the site and is a
            strict prototype.
          </p>

          <div className={styles.scope}>
            <ScopeSelector
              bodies={indexedBodies}
              value={scopeBody}
              onChange={setScopeBody}
              disabled={isStreaming}
            />
          </div>

          <ChatInput
            onSend={askScoped}
            onStop={stopGeneration}
            isStreaming={isStreaming}
          />
        </div>
      </div>

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

      <ChatHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentChatId={currentChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />
    </div>
  );
}
