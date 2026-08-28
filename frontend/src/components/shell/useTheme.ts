/**
 * The reader's light/dark choice.
 *
 * Three states, not two. `null` means "follow the system", which is what a
 * first-time reader gets; once they choose, the choice is written to
 * `data-theme` on the root element and wins over `prefers-color-scheme` in
 * both directions — the light and dark blocks in index.css are written so that
 * an explicit `light` beats a dark system preference, not only the reverse.
 *
 * localStorage throws outright in some privacy modes rather than returning
 * null, so every access is wrapped. A reader with storage disabled gets the
 * system theme and a toggle that works for the session.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark";

const KEY = "gs-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStored(): ThemeChoice | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function writeStored(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    /* Storage refused. The attribute below still holds for this session. */
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export interface Theme {
  /** What the reader is looking at right now, chosen or inherited. */
  showing: ThemeChoice;
  /** The other one — what the control's label promises. */
  next: ThemeChoice;
  toggle: () => void;
}

/**
 * Called once, in the masthead, and its result handed to both toggle buttons.
 * One piece of state for two controls is what keeps them in sync; two hooks
 * would be two states and a header that disagrees with itself.
 */
export default function useTheme(): Theme {
  const [choice, setChoice] = useState<ThemeChoice | null>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // The stored choice is read during render but only applied here: mutating
  // documentElement while rendering would run twice under StrictMode.
  useEffect(() => {
    const root = document.documentElement;
    if (choice) root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
  }, [choice]);

  // A reader with no stored choice follows the system, including when the
  // system changes under them mid-session.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  const showing: ThemeChoice = choice ?? (systemDark ? "dark" : "light");
  const next: ThemeChoice = showing === "dark" ? "light" : "dark";

  const toggle = useCallback(() => {
    setChoice((current) => {
      const shown = current ?? (systemPrefersDark() ? "dark" : "light");
      const flipped: ThemeChoice = shown === "dark" ? "light" : "dark";
      writeStored(flipped);
      return flipped;
    });
  }, []);

  return { showing, next, toggle };
}
