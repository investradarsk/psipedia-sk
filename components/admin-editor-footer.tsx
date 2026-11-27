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
  uploading = false,
  activityLabel,
  sync,
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
  uploading?: boolean;
  /** Non-save activity, for example changing the reviewed flag. */
  activityLabel?: string;
  /** Independently confirmed synchronization status, not a save acknowledgement. */
  sync?: ReactNode;
}) {
  const busy = pending || uploading || Boolean(activityLabel);
  const state = pending ? "saving" : uploading ? "uploading" : activityLabel ? "working" : dirty ? "dirty" : "idle";
  const showStatus = busy || dirty !== undefined || Boolean(message) || Boolean(feedback) || Boolean(destructive) || Boolean(back) || Boolean(sync);
  return (
    <div {...props} className={[styles.footer, className].filter(Boolean).join(" ")}
      data-admin-editor-footer data-editor-save-pending={pending ? "true" : "false"} data-editor-work-state={state} aria-busy={busy}>
      {showStatus ? (
        <div className={styles.start}>
          {back}
          {destructive}
          {(busy || message || dirty !== undefined) && (
            <div className={styles.status} role="status" aria-live="polite">
              {pending ? "Ukladám…" : uploading ? "Nahrávam súbory…" : activityLabel ?? message ?? (dirty ? "Neuložené zmeny" : "Bez neuložených zmien")}
            </div>
          )}
          {feedback}
          {sync && <div className={styles.sync}>{sync}</div>}
        </div>
      ) : null}
      <div className={styles.end}>{children}</div>
    </div>
  );
}
