/**
 * Whether this reader has asked for no movement.
 *
 * The map's zoom is the one thing on this page that moves, and it moves because
 * a reader who clicks a ward in the table has to find it on the map. Where the
 * system asks for reduced motion the zoom still happens, in one step, so the
 * selection is still framed and nothing travels across the screen.
 *
 * The CSS cross-fades answer `prefers-reduced-motion` in the stylesheet. This
 * hook is for the part CSS cannot reach: the interpolated `viewBox`.
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY).matches ?? false);

  useEffect(() => {
    const list = window.matchMedia?.(QUERY);
    if (!list) return;
    const onChange = () => setReduced(list.matches);
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
