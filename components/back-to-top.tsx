"use client";

import { useEffect, useState } from "react";
import styles from "./back-to-top.module.css";

const SHOW_AFTER_PX = 480;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
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
