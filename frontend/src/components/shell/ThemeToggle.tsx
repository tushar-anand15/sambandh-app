import type { Theme } from "./useTheme";
import styles from "./shell.module.css";

/**
 * The theme control. One of these is drawn, in the masthead. The label is what
 * the reader will get, not what they have: a button reading "Dark" is a
 * promise, not a status.
 */

interface ThemeToggleProps {
  theme: Theme;
}

export default function ThemeToggle({ theme }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className={styles.tg}
      onClick={theme.toggle}
      aria-label={`Switch to the ${theme.next} theme`}
      data-testid="theme-toggle"
    >
      {theme.next === "dark" ? "Dark" : "Light"}
    </button>
  );
}
