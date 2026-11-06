import { type ReactNode } from "react";
import styles from "./admin-editor-tool-frame.module.css";

/**
 * A presentational layer for existing canonical editor tools. It deliberately
 * owns no uploads, map lookups, field values, relation state, SEO persistence,
 * form submissions or visibility decisions.
 */
export type AdminEditorToolKind =
  | "image"
  | "gallery"
  | "map"
  | "contacts"
  | "relations"
  | "seo";

export function AdminEditorToolFrame({
  kind,
  children,
  className,
  description,
}: {
  kind: AdminEditorToolKind;
  children: ReactNode;
  className?: string;
  description?: string;
}) {
  return (
    <div
      className={[styles.frame, className].filter(Boolean).join(" ")}
      data-admin-editor-tool={kind}
    >
      {description ? <p className={styles.description}>{description}</p> : null}
      {children}
    </div>
  );
}
