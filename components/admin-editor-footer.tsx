import type { HTMLAttributes, ReactNode } from "react";
import styles from "./admin-editor-footer.module.css";

/**
 * One presentational action bar for canonical editors.
 * All save, publish, unpublish, navigation and dirty-guard handlers stay in
 * the owning editor; this wrapper never submits or mutates a record.
 */
export function AdminEditorFooter({
  children,
  back,
  destructive,
  message,
  feedback,
  dirty,
  pending = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  back?: ReactNode;
  destructive?: ReactNode;
  message?: ReactNode;
  feedback?: ReactNode;
  dirty?: boolean;
  pending?: boolean;
}) {
  const showStatus = dirty !== undefined || Boolean(message) || Boolean(feedback) || Boolean(destructive) || Boolean(back);
  return (
    <div {...props} className={[styles.footer, className].filter(Boolean).join(" ")}
      data-admin-editor-footer data-editor-save-pending={pending ? "true" : "false"} aria-busy={pending}>
      {showStatus ? (
        <div className={styles.start}>
          {back}
          {destructive}
          {(message || dirty !== undefined) && (
            <div className={styles.status} role="status" aria-live="polite">
              {message ?? (pending ? "Ukladám…" : dirty ? "Neuložené zmeny" : "Bez neuložených zmien")}
            </div>
          )}
          {feedback}
        </div>
      ) : null}
      <div className={styles.end}>{children}</div>
    </div>
  );
}
