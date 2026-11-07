import type { ComponentProps } from "react";
import styles from "./admin-shadcn-editor.module.css";

/**
 * Adapted from satnaing/shadcn-admin (MIT, Sat Naing 2024):
 * src/components/ui/card.tsx, input.tsx and textarea.tsx.
 *
 * Retains the upstream Card/Input/Textarea composition and data-slot contract.
 * Visual tokens are scoped to Psipedia Admin instead of importing the Vite
 * dashboard's global theme, router or additional dependencies.
 * See third_party/shadcn-admin/LICENSE.
 */
function classes(base: string, extra?: string) {
  return extra ? base + " " + extra : base;
}

export function AdminUiCard({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={classes(styles.card, className)} {...props} />;
}
export function AdminUiCardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={classes(styles.cardHeader, className)} {...props} />;
}
export function AdminUiCardTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-title" className={classes(styles.cardTitle, className)} {...props} />;
}
export function AdminUiCardDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-description" className={classes(styles.cardDescription, className)} {...props} />;
}
export function AdminUiCardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={classes(styles.cardContent, className)} {...props} />;
}
export function AdminUiCardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={classes(styles.cardFooter, className)} {...props} />;
}
export function AdminUiInput({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={classes(styles.input, className)} {...props} />;
}
export function AdminUiTextarea({
  className,
  length = "standard",
  ...props
}: ComponentProps<"textarea"> & { length?: "short" | "standard" | "long" }) {
  return <textarea data-slot="textarea" data-editor-text-length={length}
    className={classes(styles.textarea, className)} {...props} />;
}

/** Native keyboard, form and validation semantics are retained. */
export function AdminUiSelect({ className, children, ...props }: ComponentProps<"select">) {
  return <select data-slot="select" className={classes(styles.select, className)} {...props}>{children}</select>;
}

export function AdminUiCheckbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return <input type="checkbox" data-slot="checkbox" className={classes(styles.checkbox, className)} {...props} />;
}
