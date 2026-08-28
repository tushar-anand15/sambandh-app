/**
 * Three questions the library can actually answer, offered before the first
 * one is typed.
 *
 * They name bodies that are in the index — Chalakkudy, Adat, Athirappilly,
 * Thrissur — because a suggested question about a body nobody ingested teaches
 * the reader that the assistant refuses, which is the wrong first lesson. The
 * Malayalam one is here because answers come back in Malayalam and a reader
 * has no other way to learn that questions may go out in it.
 */

import styles from "./chat.module.css";

const PROMPTS = [
  "What road construction projects are in Chalakkudy?",
  "Compare spending between Adat and Athirappilly panchayats",
  "What is project 273 in Chalakkudy about?",
  "How many projects does Thrissur Corporation have?",
  "റോഡ് നിർമ്മാണ പദ്ധതികൾ",
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className={styles.prompts}>
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className={styles.prompt}
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
