"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./back-to-top.module.css";

const SHOW_AFTER_PX = 480;

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      frameRef.current = null;
      const next = window.scrollY > SHOW_AFTER_PX;
      // Scroll fires rapidly on mobile. Render only on a real threshold
      // crossing, instead of scheduling React updates for every pixel.
      if (visibleRef.current === next) return;
      visibleRef.current = next;
      setVisible(next);
    };
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  if (!visible) return null;

  function scrollToTop() {
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    window.scrollTo({ top: 0, behavior });
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Späť hore"
      title="Späť hore"
      onClick={scrollToTop}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 14.5 12 9l5.5 5.5" />
      </svg>
    </button>
  );
}
