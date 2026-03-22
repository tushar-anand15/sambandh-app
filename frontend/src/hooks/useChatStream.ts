import { useState, useRef, useCallback, startTransition, useEffect } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { ChatMessage, ChatSource, ToolCallEvent } from "@/types";

interface UseChatStreamOptions {
  chatId: string | null;
  onChatCreated?: (chatId: string) => void;
  onTitleGenerated?: (title: string) => void;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  currentToolCall: ToolCallEvent | null;
  sendMessage: (text: string) => void;
  stopGeneration: () => void;
  clearHistory: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

export default function useChatStream(
  options: UseChatStreamOptions = { chatId: null }
): UseChatStreamReturn {
  const { chatId, onChatCreated, onTitleGenerated } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCallEvent | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingTextRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const assistantIdRef = useRef("");
  const toolCallsRef = useRef<ToolCallEvent[]>([]);
  
  // Use a ref to track the current chat ID so we always use the latest value
  const chatIdRef = useRef<string | null>(chatId);
  
  // Keep the ref in sync with the prop
  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const flushText = useCallback(() => {
    const text = pendingTextRef.current;
    const id = assistantIdRef.current;
    const tools = [...toolCallsRef.current];
    startTransition(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: text, toolCalls: tools, isStreaming: true } : m
        )
      );
    });
    rafRef.current = null;
  }, []);

  const pushToken = useCallback(
    (token: string) => {
      pendingTextRef.current += token;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushText);
      }
    },
    [flushText]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      const assistantId = crypto.randomUUID();
      assistantIdRef.current = assistantId;
      pendingTextRef.current = "";
      toolCallsRef.current = [];

      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setIsThinking(true);
      setCurrentToolCall(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const token = localStorage.getItem("auth_token");

      try {
        // Use the ref value to always get the latest chatId
        const currentChatId = chatIdRef.current;
        
        await fetchEventSource("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            chat_id: currentChatId,
          }),
          signal: controller.signal,

          onopen: async (response) => {
            if (!response.ok) {
              if (response.status === 401) {
                localStorage.removeItem("auth_token");
                localStorage.removeItem("auth_user");
                window.location.href = "/login";
              }
              throw new Error(`HTTP ${response.status}`);
            }
          },

          onmessage: (ev) => {
            if (!ev.data) return;

            switch (ev.event) {
              case "chat_id": {
                const { chat_id } = JSON.parse(ev.data);
                if (chat_id) {
                  // Update the ref immediately so subsequent messages use the new chat_id
                  chatIdRef.current = chat_id;
                  if (onChatCreated) {
                    onChatCreated(chat_id);
                  }
                }
                break;
              }
              case "chat_title": {
                const { title } = JSON.parse(ev.data);
                if (title && onTitleGenerated) {
                  onTitleGenerated(title);
                }
                break;
              }
              case "thinking": {
                // Agent is processing - keep thinking state active
                break;
              }
              case "token": {
                const { content } = JSON.parse(ev.data);
                if (content) {
                  setIsThinking(false);
                  pushToken(content);
                }
                break;
              }
              case "tool_start": {
                setIsThinking(false);
                const data = JSON.parse(ev.data);
                const tc: ToolCallEvent = {
                  tool: data.tool,
                  input: data.input || {},
                  status: "running",
                };
                toolCallsRef.current = [...toolCallsRef.current, tc];
                setCurrentToolCall(tc);
                // Immediately update message to show tool call
                const currentTools = [...toolCallsRef.current];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantIdRef.current
                      ? { ...m, toolCalls: currentTools, isStreaming: true }
                      : m
                  )
                );
                break;
              }
              case "tool_end": {
                const data = JSON.parse(ev.data);
                toolCallsRef.current = toolCallsRef.current.map((tc) =>
                  tc.tool === data.tool && tc.status === "running"
                    ? { ...tc, output: data.output, outputSummary: data.output_summary, status: "done" as const }
                    : tc
                );
                setCurrentToolCall(null);
                // Immediately update message to show completed tool
                const currentTools = [...toolCallsRef.current];
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantIdRef.current
                      ? { ...m, toolCalls: currentTools, isStreaming: true }
                      : m
                  )
                );
                break;
              }
              case "sources": {
                try {
                  const sources: ChatSource[] = JSON.parse(ev.data);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, sources } : m
                    )
                  );
                } catch {
                  /* ignore parse errors */
                }
                break;
              }
              case "error": {
                const { message } = JSON.parse(ev.data);
                pendingTextRef.current += `\n\n*Error: ${message}*`;
                flushText();
                break;
              }
              case "done": {
                break;
              }
            }
          },

          onerror: (err) => {
            if (controller.signal.aborted) return;
            console.error("SSE error:", err);
            throw err;
          },

          onclose: () => {
            // Stream finished
          },
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          const errorText = pendingTextRef.current || "Sorry, something went wrong. Please try again.";
          pendingTextRef.current = errorText;
        }
      } finally {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        flushText();

        const finalText = pendingTextRef.current;
        const finalTools = [...toolCallsRef.current];
        startTransition(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: finalText, toolCalls: finalTools, isStreaming: false }
                : m
            )
          );
        });

        setIsStreaming(false);
        setIsThinking(false);
        setCurrentToolCall(null);
        abortRef.current = null;
      }
    },
    [onChatCreated, onTitleGenerated, pushToken, flushText]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setIsThinking(false);
    setCurrentToolCall(null);
    chatIdRef.current = null;
  }, []);

  return {
    messages,
    isStreaming,
    isThinking,
    currentToolCall,
    sendMessage,
    stopGeneration,
    clearHistory,
    setMessages,
  };
}
