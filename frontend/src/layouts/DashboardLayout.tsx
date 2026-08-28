/**
 * The frame the assistant sits in.
 *
 * Two jobs, and no state worth sharing. It pins the assistant to the viewport
 * below the site chrome, and it stops the document behind it from scrolling —
 * because there are now two scrollable things on the screen and only one of
 * them should move when the reader spins the wheel over a transcript.
 *
 * `--assistant-top` is measured, not assumed. The masthead collapses on scroll
 * and opens collapsed everywhere but the home page, so its height is a moving
 * number owned by another part of the app; a constant here would leave a strip
 * of dead page above the header strip or hide it under one. The measurement
 * takes the lower of two edges: where the in-flow content of the page begins,
 * and the bottom of the site header, which differ when the header is fixed
 * rather than sticky.
 *
 * The sidebar this layout used to carry is gone. It held one link — Assistant —
 * which the site's own tab bar already carries, under a second wordmark that
 * competed with the masthead. Signing out moved to the assistant's header
 * strip, next to the other things you can do to a conversation.
 */

import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";

import styles from "./appShell.module.css";

export default function DashboardLayout() {
  const anchor = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => {
      const start = anchor.current;
      const frame = shell.current;
      if (!start || !frame) return;

      const header = document.querySelector("header");
      const below = header ? header.getBoundingClientRect().bottom : 0;
      const top = Math.max(0, Math.round(Math.max(start.getBoundingClientRect().top, below)));

      frame.style.setProperty("--assistant-top", `${top}px`);
    };

    measure();
    // Web fonts and the header's own layout settle a frame late.
    const frame = requestAnimationFrame(measure);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });

    // The header changing height changes the body's, which is what this
    // watches: the anchor itself never resizes, it only moves.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(document.body);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <>
      <div ref={anchor} className={styles.anchor} aria-hidden="true" />
      <div ref={shell} className={styles.shell}>
        <Outlet />
      </div>
    </>
  );
}
