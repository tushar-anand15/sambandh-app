/**
 * The question box, pinned to the bottom of the shell.
 *
 * Enter sends, Shift+Enter breaks the line, and the box grows with the
 * question up to a bound — a long question is common here, because the useful
 * ones name a body, a year and a scheme.
 *
 * There is no "start again" button any more. It sat next to the send button and
 * threw the conversation away on one click; starting again is "New chat" in the
 * header strip, where the other things you can do to a conversation live.
 */

import { useState, useRef, useEffect } from "react";

import styles from "./chat.module.css";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

const MAX_HEIGHT = 160;

export default function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <div className={styles.composer}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          placeholder="Ask about a project, in English or Malayalam"
          aria-label="Ask about a project"
          rows={1}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
          }}
        />

        {isStreaming ? (
          <button type="button" className={styles.action} onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className={styles.send}
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
          >
            Ask
          </button>
        )}
      </div>

      <p className={styles.hint}>
        Enter sends. Shift and Enter start a new line.
      </p>
    </>
  );
}
