import type { Theme } from "./useTheme";
import styles from "./shell.module.css";

/**
 * The theme control. Two of these are drawn — one in the utility strip, one in
 * the sticky bar — and both are handed the same `Theme`, so they never
 * disagree. The label is what you will get, not what you have: a button
 * reading "Dark" is a promise, not a status.
 */

interface ThemeToggleProps {
  theme: Theme;
  /** The sticky-bar instance, which is folded away while the nameplate is up. */
  inBar?: boolean;
}

export default function ThemeToggle({ theme, inBar = false }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className={inBar ? `${styles.tg} ${styles.tgInBar}` : styles.tg}
      onClick={theme.toggle}
      aria-label={`Switch to the ${theme.next} theme`}
      data-testid={inBar ? "theme-toggle-bar" : "theme-toggle"}
    >
      {theme.next === "dark" ? "Dark" : "Light"}
    </button>
  );
}
