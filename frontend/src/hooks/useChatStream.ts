import { useState, useRef, useCallback, startTransition } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { ChatMessage, ChatSource, ToolCallEvent } from "@/types";

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentToolCall: ToolCallEvent | null;
  sendMessage: (text: string) => void;
  stopGeneration: () => void;
  clearHistory: () => void;
}

export default function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<ToolCallEvent | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingTextRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const assistantIdRef = useRef("");
  const toolCallsRef = useRef<ToolCallEvent[]>([]);

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
      setCurrentToolCall(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const token = localStorage.getItem("auth_token");

      try {
        await fetchEventSource("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: text }),
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
              case "token": {
                const { content } = JSON.parse(ev.data);
                if (content) pushToken(content);
                break;
              }
              case "tool_start": {
                const data = JSON.parse(ev.data);
                const tc: ToolCallEvent = {
                  tool: data.tool,
                  input: data.input || {},
                  status: "running",
                };
                toolCallsRef.current = [...toolCallsRef.current, tc];
                setCurrentToolCall(tc);
                break;
              }
              case "tool_end": {
                const data = JSON.parse(ev.data);
                toolCallsRef.current = toolCallsRef.current.map((tc) =>
                  tc.tool === data.tool && tc.status === "running"
                    ? { ...tc, outputSummary: data.output_summary, status: "done" as const }
                    : tc
                );
                setCurrentToolCall(null);
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
        setCurrentToolCall(null);
        abortRef.current = null;
      }
    },
    [pushToken, flushText]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setCurrentToolCall(null);
  }, []);

  return { messages, isStreaming, currentToolCall, sendMessage, stopGeneration, clearHistory };
}
