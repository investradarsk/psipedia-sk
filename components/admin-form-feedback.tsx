"use client";

import type { ReactNode } from "react";
import styles from "./admin-form-feedback.module.css";

export type AdminFormFeedbackProps = {
  message?: ReactNode;
  error?: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  className?: string;
  errorClassName?: string;
  successClassName?: string;
};

/** Single presentation contract for admin save, success and error states.
 * The editor still owns validation, persistence and retry behavior.
 */
export function AdminFormFeedback({
  message,
  error,
  pending = false,
  pendingLabel = "Ukladám…",
  className,
  errorClassName,
  successClassName,
}: AdminFormFeedbackProps) {
  const state = error ? "error" : pending ? "saving" : message ? "success" : null;
  if (!state) return null;

  const classNames = [
    styles.feedback,
    state === "error" ? styles.error : styles.info,
    className,
    state === "error" ? errorClassName : successClassName,
  ].filter(Boolean).join(" ");

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      data-admin-form-feedback={state}
      className={classNames}
    >
      {state === "error" ? error : state === "saving" ? pendingLabel : message}
    </div>
  );
}
